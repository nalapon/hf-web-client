#!/bin/bash

# --- Configuration ---
FABRIC_SAMPLE_DIR="fabric-samples"
FABRIC_BIN_DIR="$FABRIC_SAMPLE_DIR/bin"
TEST_NETWORK_DIR="$FABRIC_SAMPLE_DIR/test-network"
CHAINCODE_NAME="basic"
CHANNEL_NAME="mychannel"
CHAINCODE_LANG="go"
CHAINCODE_PKG_PATH="../asset-transfer-basic/chaincode-go/" # Relative to TEST_NETWORK_DIR

# Proxy Configuration
PROXY_IMAGE="nalapon/grpcweb-proxy-gw:latest" # The pre-built Docker Hub image
PROXY_CONTAINER_NAME="grpcwebproxy"
PROXY_LISTEN_PORT="8088"                       # Port your proxy listens on for gRPC-web
PROXY_GRPC_PORT="7051"                         # Port your proxy targets for gRPC (Peer's gRPC port)
PROXY_COMPOSE_FILE="docker-compose.proxy.yaml" # Dynamically created compose file for the proxy
PROXY_CERTS_DIR_NAME="proxy_certs"             # Directory to store copied certs for proxy

# --- Colors for Logs ---
COLOR_RESET="\033[0m"
COLOR_GREEN="\033[0;32m"
COLOR_RED="\033[0;31m"
COLOR_BLUE="\033[0;34m"
COLOR_YELLOW="\033[0;33m"

# --- Utility Functions ---
function infoln() { echo -e "${COLOR_BLUE}[INFO]${COLOR_RESET} $1"; }
function errorln() {
	echo -e "${COLOR_RED}[ERROR]${COLOR_RESET} $1"
	exit 1
}
function successln() { echo -e "${COLOR_GREEN}[SUCCESS]${COLOR_RESET} $1"; }
function warnln() { echo -e "${COLOR_YELLOW}[WARN]${COLOR_RESET} $1"; }

# --- Docker Utility Functions ---
function docker_cleanup_containers() {
	infoln "Stopping and removing all Docker containers related to Hyperledger Fabric..."
	CONTAINER_IDS=$(docker ps -a --filter "name=peer.*" --filter "name=orderer.*" --filter "name=ca.*" --filter "name=dev-peer.*" --filter "name=ccenv.*" --filter "name=couchdb.*" --filter "name=${PROXY_CONTAINER_NAME}.*" -q)
	if [ -n "$CONTAINER_IDS" ]; then
		echo "$CONTAINER_IDS" | xargs docker stop >/dev/null 2>&1
		echo "$CONTAINER_IDS" | xargs docker rm >/dev/null 2>&1
		successln "Stopped and removed matching Docker containers."
	else
		infoln "No running or stopped Fabric-related containers found."
	fi
}

function docker_cleanup_volumes() {
	infoln "Removing Docker volumes related to Hyperledger Fabric..."
	VOLUME_NAMES=$(docker volume ls -q --filter "name=peer.*" --filter "name=orderer.*" --filter "name=ca.*" --filter "name=dev-peer.*" --filter "name=ccenv.*" --filter "name=couchdb.*" --filter "name=ledgers.*" 2>/dev/null)
	if [ -n "$VOLUME_NAMES" ]; then
		echo "$VOLUME_NAMES" | xargs docker volume rm >/dev/null 2>&1
		successln "Removed matching Docker volumes."
	else
		infoln "No matching Docker volumes found."
	fi
}

# --- Script State Check Functions ---
function is_fabric_installed() {
	[ -d "$ROOTDIR/$FABRIC_SAMPLE_DIR" ] && [ -f "$ROOTDIR/$TEST_NETWORK_DIR/network.sh" ] && command -v "$ROOTDIR/$FABRIC_BIN_DIR/network.sh" &>/dev/null
}

function is_fabric_network_running() {
	docker ps -q --filter "name=peer.*" --filter "name=orderer.*" --filter "name=ca.*" --filter "label=service=hyperledger-fabric" | grep -q .
}

function is_channel_created() {
	[ -f "$ROOTDIR/$TEST_NETWORK_DIR/channel-artifacts/${CHANNEL_NAME}.block" ]
}

function is_chaincode_deployed() {
	docker ps -q --filter "name=dev-peer0.org1.example.com-${CHAINCODE_NAME}_.*" | grep -q .
}

function is_proxy_running() {
	docker ps -q --filter "name=${PROXY_CONTAINER_NAME}" | grep -q .
}

# Function to install Fabric binaries and samples
function install_fabric() {
	infoln "Fabric samples or binaries not found. Downloading and installing..."
	# Run install-fabric.sh from the project root so it downloads samples to the right place
	(cd "$ROOTDIR" && curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh)
	if [ $? -ne 0 ]; then errorln "Failed to download install-fabric.sh."; fi
	(cd "$ROOTDIR" && chmod +x install-fabric.sh)
	(cd "$ROOTDIR" && ./install-fabric.sh)
	if [ $? -ne 0 ]; then errorln "Fabric installation failed."; fi
	if [ ! -d "$FABRIC_SAMPLE_DIR" ]; then errorln "Fabric samples directory '$FABRIC_SAMPLE_DIR' not created."; fi
	successln "Fabric binaries and samples downloaded and installed."
	rm "$ROOTDIR/install-fabric.sh"
}

# Function to set up the proxy service
# Parameters:
#   $1: ROOTDIR (directory where setup_fabric_test_env.sh is run)
function setup_proxy_service() {
	local ROOTDIR="$1"
	# Corrected path to be relative to the ROOTDIR where fabric-samples is now downloaded
	local FABRIC_SAMPLES_ROOT="$ROOTDIR/fabric-samples"

	# If this is still wrong, we'll need user input or a different discovery method.
	local TEST_NETWORK_DIR_PATH="$FABRIC_SAMPLES_ROOT/test-network"

	infoln "--- Setting up gRPC-Web Proxy Service ---"
	infoln "Fabric Samples Root: $FABRIC_SAMPLES_ROOT"
	infoln "Test Network Directory Path: $TEST_NETWORK_DIR_PATH"

	# --- Validate that fabric-samples directory exists ---
	if [ ! -d "$FABRIC_SAMPLES_ROOT" ]; then
		errorln "ERROR: fabric-samples directory not found at '$FABRIC_SAMPLES_ROOT'."
		errorln "Please ensure the 'fabric-samples' directory is in the same directory as this script, or adjust FABRIC_SAMPLE_DIR variable."
		return 1
	fi
	if [ ! -d "$TEST_NETWORK_DIR_PATH" ]; then
		errorln "ERROR: test-network directory not found within fabric-samples at '$TEST_NETWORK_DIR_PATH'."
		errorln "Please ensure you have downloaded and extracted the fabric-samples correctly."
		return 1
	fi
	successln "Successfully located fabric-samples and test-network directories."

	# --- CRITICAL: Define paths to credentials ON YOUR HOST MACHINE ---
	local fabric_org_msp_dir_host="$TEST_NETWORK_DIR_PATH/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
	local peer_tls_ca_cert_host="$TEST_NETWORK_DIR_PATH/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
	local admin_cert_host="${fabric_org_msp_dir_host}/signcerts/cert.pem"
	local admin_key_host=$(find "${fabric_org_msp_dir_host}/keystore" -type f -name "*_sk" | head -n 1)

	infoln "Attempting to locate credentials at the following host paths:"
	infoln "  Admin MSP Dir: '$fabric_org_msp_dir_host'"
	infoln "  CA Cert Path:  '$peer_tls_ca_cert_host'"
	infoln "  Admin Cert Path: '$admin_cert_host'"
	infoln "  Admin Key Path:  '$admin_key_host'"

	# --- Validate that these files EXIST ON YOUR HOST ---
	if [ ! -f "$peer_tls_ca_cert_host" ]; then
		errorln "ERROR: CA Cert not found at '$peer_tls_ca_cert_host'"
		return 1
	fi
	if [ ! -f "$admin_cert_host" ]; then
		errorln "ERROR: Admin Cert not found at '$admin_cert_host'"
		return 1
	fi
	if [ -z "$admin_key_host" ] || [ ! -f "$admin_key_host" ]; then
		errorln "ERROR: Admin Key not found or path is empty."
		errorln "  Attempted to find key in: '${fabric_org_msp_dir_host}/keystore'"
		if [ -d "${fabric_org_msp_dir_host}/keystore" ]; then
			infoln "Contents of keystore directory:"
			ls -l "${fabric_org_msp_dir_host}/keystore"
		else
			infoln "Keystore directory does not exist."
		fi
		return 1
	fi
	successln "Successfully located all Fabric credentials on the host."

	# --- Prepare a directory on the HOST to stage certificates ---
	# This directory will be MOUNTED into the Docker container.
	# Ensure this path is ABSOLUTE.
	local proxy_certs_staging_dir="$ROOTDIR/$PROXY_CERTS_DIR_NAME"
	infoln "Creating host staging directory for certificates: '$proxy_certs_staging_dir'"
	mkdir -p "$proxy_certs_staging_dir"

	# --- COPY the found certificate files TO THE HOST STAGING DIRECTORY ---
	infoln "Copying credentials to staging directory..."
	cp "$peer_tls_ca_cert_host" "$proxy_certs_staging_dir/tlsca-cert.pem"
	cp "$admin_cert_host" "$proxy_certs_staging_dir/admin-cert.pem"
	cp "$admin_key_host" "$proxy_certs_staging_dir/admin-key.sk"
	successln "Copied credentials to host staging directory."

	# --- Determine the name of the Docker network created by fabric-samples ---
	local fabric_network_name="fabric_test"
	infoln "Detected Fabric Docker network name: '$fabric_network_name'"

	# --- Dynamically Create the Docker Compose file for the Proxy ---
	local compose_file_path="$ROOTDIR/$PROXY_COMPOSE_FILE" # Using ROOTDIR here as it's the context for compose file creation
	infoln "Creating dynamic docker-compose file at: '$compose_file_path'"
	cat <<EOF >"$compose_file_path"
version: '3.8'

services:
  grpcwebproxy:
    image: $PROXY_IMAGE
    container_name: $PROXY_CONTAINER_NAME
    ports:
      - "$PROXY_LISTEN_PORT:8088"

    environment:
      SERVER_LISTEN_ADDR: "0.0.0.0:8088"
      SERVER_ALLOWED_ORIGINS: "*"
      FABRIC_GATEWAY_ADDRESS: "peer0.org1.example.com:$PROXY_GRPC_PORT"
      FABRIC_HOSTNAME: "peer0.org1.example.com"
      FABRIC_TLS_ENABLED: "true"
      FABRIC_TLS_CA_CERT_PATH: "/certs/tlsca-cert.pem"
      FABRIC_TLS_CLIENT_CERT_PATH: "/certs/admin-cert.pem"
      FABRIC_TLS_CLIENT_KEY_PATH: "/certs/admin-key.sk"
      LOG_LEVEL: "info"
      LOG_FORMAT: "text"

    volumes:
      # THIS IS THE CRITICAL VOLUME MOUNT.
      # It maps the ABSOLUTE HOST path '$proxy_certs_staging_dir'
      # to the CONTAINER path '/certs'.
      - "$proxy_certs_staging_dir:/certs:ro"

    networks:
      - "$fabric_network_name"

networks:
  "$fabric_network_name":
    external: true
EOF
	successln "Docker Compose file created."

	# --- START THE PROXY CONTAINER ---
	# Execute docker compose from the ROOTDIR so it can correctly resolve the volume path.
	infoln "Attempting to start the proxy container using Docker Compose..."
	infoln "Executing from directory: '$ROOTDIR'"
	infoln "Using compose file: '$compose_file_path'"
	# Ensure we are in the ROOTDIR context for docker compose execution
	(cd "$ROOTDIR" && docker compose -f "$compose_file_path" up -d)
	local docker_compose_exit_code=$?

	if [ $docker_compose_exit_code -ne 0 ]; then
		errorln "ERROR: Docker Compose command failed with exit code $docker_compose_exit_code."
		errorln "Please check the contents of '$compose_file_path' and try running 'docker compose logs $PROXY_CONTAINER_NAME' from '$ROOTDIR' for more details."
		return 1
	fi
	successln "gRPC-Web proxy container started successfully."
	infoln "--- gRPC-Web Proxy Setup Complete ---"
}

# Function to bring up the network
function network_up() {
	if ! is_fabric_installed; then
		install_fabric
	else
		infoln "Fabric binaries and samples already exist. Skipping download."
	fi

	# Navigate to the test network directory for Fabric commands
	cd "$TEST_NETWORK_DIR" || errorln "Could not change directory to $TEST_NETWORK_DIR. Ensure fabric-samples were installed correctly."

	# Bring up the network
	infoln "Starting Fabric test network..."
	./network.sh up createChannel -ca -s couchdb
	if [ $? -ne 0 ]; then errorln "Failed to bring up the Fabric network or create the channel."; fi
	successln "Fabric network is up and channel '$CHANNEL_NAME' is created."

	if ! is_chaincode_deployed; then
		infoln "Deploying chaincode '$CHAINCODE_NAME'..."
		./network.sh deployCC -ccn "$CHAINCODE_NAME" -ccp "$CHAINCODE_PKG_PATH" -ccl "$CHAINCODE_LANG"
		if [ $? -ne 0 ]; then errorln "Failed to deploy chaincode '$CHAINCODE_NAME'."; fi
		successln "Chaincode '$CHAINCODE_NAME' deployed successfully."
	else
		infoln "Chaincode '$CHAINCODE_NAME' appears to be deployed."
	fi

	# --- Proxy Setup ---
	if ! is_proxy_running; then
		# IMPORTANT: cd back to ROOTDIR to correctly set up proxy context and paths
		cd "$ROOTDIR" || errorln "Failed to return to ROOTDIR '$ROOTDIR' after Fabric setup."
		setup_proxy_service "$ROOTDIR" # Pass ROOTDIR to setup_proxy_service
	else
		infoln "gRPC-Web proxy container '$PROXY_CONTAINER_NAME' is already running."
	fi
	# --- End Proxy Setup ---

	# Provide instructions for next steps
	echo ""
	infoln "-----------------------------------------------------------------------"
	infoln "Fabric test network setup complete!"
	infoln "You are currently in the '$ROOTDIR' directory."
	infoln "gRPC-Web proxy is running and accessible on http://localhost:8088"
	infoln ""
	infoln "To interact with the network, you need to set up your environment variables."
	infoln ""
	infoln "Example for Org1 admin:"
	infoln "  export FABRIC_CFG_PATH=$ROOTDIR/$TEST_NETWORK_DIR"
	infoln "  export CORE_PEER_LOCALMSPID=\"Org1MSP\""
	infoln "  export CORE_PEER_MSPCONFIGPATH=$ROOTDIR/$TEST_NETWORK_DIR/../organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
	infoln "  export CORE_PEER_ADDRESS=localhost:7051"
	infoln ""
	infoln "Then you can invoke/query using the network.sh script:"
	infoln "  cd $ROOTDIR/$TEST_NETWORK_DIR && \\"
	infoln "  ./network.sh invoke -C \"$CHANNEL_NAME\" -n \"$CHAINCODE_NAME\" -c '{\"Args\":[\"Put\",\"key1\",\"value1\"]}' && \\"
	infoln "  ./network.sh query -C \"$CHANNEL_NAME\" -n \"$CHAINCODE_NAME\" -c '{\"Args\":[\"Get\",\"key1\"]}'"
	infoln ""
	infoln "To stop and clean up everything, run: \"$ROOTDIR/setup_fabric_test_env.sh down\""
	infoln "-----------------------------------------------------------------------"
}

# Function to tear down the network and clean up
function network_down() {
	infoln "Tearing down Fabric network and cleaning up all associated data..."

	local original_dir=$(pwd)
	local test_network_dir_abs=""
	local fabric_network_name=""

	# Attempt to find the test-network directory and get its absolute path, anchored to ROOTDIR
	if [ -d "$ROOTDIR/$FABRIC_SAMPLE_DIR/test-network" ]; then
		test_network_dir_abs=$(cd "$ROOTDIR/$FABRIC_SAMPLE_DIR/test-network" && pwd)
		fabric_network_name="$(basename "$test_network_dir_abs")_default"
	fi

	# --- Docker Cleanup ---
	if command -v docker &>/dev/null; then
		infoln "Executing Docker cleanup..."
		docker_cleanup_containers

		if [ -n "$fabric_network_name" ] && docker network ls --filter "name=$fabric_network_name" -q | grep -q .; then
			infoln "Removing Fabric network '$fabric_network_name'..."
			docker network rm "$fabric_network_name"
		fi
		for net_pattern in "test-network" "minifab_net"; do
			NET_ID=$(docker network ls --filter "name=$net_pattern" -q)
			if [ -n "$NET_ID" ]; then
				infoln "Removing stray Docker network '$net_pattern' ($NET_ID)..."
				docker network rm "$NET_ID"
			fi
		done
		docker_cleanup_volumes
	else
		warnln "Docker command not found. Skipping Docker cleanup."
	fi

	# --- Proxy Container/Image/Compose/Project Cleanup ---
	if docker ps -a --filter "name=${PROXY_CONTAINER_NAME}" -q | grep -q .; then
		infoln "Stopping and removing proxy container '${PROXY_CONTAINER_NAME}'..."
		docker stop "$PROXY_CONTAINER_NAME" >/dev/null 2>&1
		docker rm "$PROXY_CONTAINER_NAME" >/dev/null 2>&1
		successln "Proxy container removed."
	fi
	if docker images -q grpcwebproxy:latest &>/dev/null; then
		infoln "Removing proxy Docker image 'grpcwebproxy:latest'..."
		docker rmi grpcwebproxy:latest >/dev/null 2>&1
		successln "Proxy Docker image removed."
	fi
	if [ -f "$PROXY_COMPOSE_FILE" ]; then
		infoln "Removing dynamically created proxy compose file: '$PROXY_COMPOSE_FILE'..."
		rm -f "$PROXY_COMPOSE_FILE"
		successln "Proxy compose file removed."
	fi
	# Removed cleanup for MY_PROXY_PROJECT_DIR as we are not cloning it.

	# --- Fabric Samples Cleanup ---
	if [ -d "$ROOTDIR/$FABRIC_SAMPLE_DIR" ]; then
		infoln "Removing Fabric samples directory: '$ROOTDIR/$FABRIC_SAMPLE_DIR'..."
		rm -rf "$ROOTDIR/$FABRIC_SAMPLE_DIR"
		successln "Fabric samples directory removed."
	else
		infoln "Fabric samples directory '$FABRIC_SAMPLE_DIR' not found."
	fi

	infoln "Full cleanup process finished."
}

# --- Main Execution ---

# Check Docker
if ! command -v docker &>/dev/null; then errorln "Docker is not installed or not in your PATH."; fi
if ! docker info >/dev/null 2>&1; then errorln "Docker daemon is not running. Please start Docker."; fi

# Capture script's original directory (ROOTDIR)
ROOTDIR=$(pwd)

# Parse command line arguments
COMMAND=$1

case "$COMMAND" in
up)
	network_up
	;;
down)
	network_down
	;;
*)
	echo "Usage: $0 {up|down}"
	errorln "Invalid command. Please use 'up' to set up the environment or 'down' to clean it up."
	;;
esac

exit 0
