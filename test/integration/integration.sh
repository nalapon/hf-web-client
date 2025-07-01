#!/bin/bash

# This script is designed to be run from its own directory.
# It calculates the project root directory based on its location.
set -e

# --- Configuration ---
ROOTDIR=$(cd "$(dirname "$0")/../.." && pwd)

FABRIC_SAMPLE_DIR="$ROOTDIR/fabric-samples"
TEST_NETWORK_DIR="$FABRIC_SAMPLE_DIR/test-network"
CHAINCODE_NAME="basic"
CHANNEL_NAME="mychannel"
CHAINCODE_LANG="go"
CHAINCODE_PKG_PATH="../asset-transfer-basic/chaincode-go/" # Relative to TEST_NETWORK_DIR

# Proxy Configuration
PROXY_IMAGE="nalapon/grpcweb-proxy-gw:latest"
PROXY_CONTAINER_NAME="grpcwebproxy"
PROXY_LISTEN_PORT="8088"
PROXY_GRPC_PORT="7051"
PROXY_COMPOSE_FILE="$ROOTDIR/docker-compose.proxy.yaml"
PROXY_CERTS_DIR="$ROOTDIR/proxy_certs"

# --- Colors for Logs ---
COLOR_RESET="\033[0m"
COLOR_GREEN="\033[0;32m"
COLOR_RED="\033[0;31m"
COLOR_BLUE="\033[0;34m"

# --- Utility Functions ---
function infoln() { echo -e "${COLOR_BLUE}[INFO]${COLOR_RESET} $1"; }
function errorln() { echo -e "${COLOR_RED}[ERROR]${COLOR_RESET} $1"; exit 1; }
function successln() { echo -e "${COLOR_GREEN}[SUCCESS]${COLOR_RESET} $1"; }

# --- Docker Cleanup ---
function cleanup_docker() {
    infoln "Cleaning up Docker resources..."
	docker system prune -a -f --volumes 
    docker stop $(docker ps -a -q --filter "name=peer.*" --filter "name=orderer.*" --filter "name=ca.*" --filter "name=dev-peer.*" --filter "name=ccenv.*" --filter "name=couchdb.*" --filter "name=${PROXY_CONTAINER_NAME}.*") 2>/dev/null || true
    docker rm $(docker ps -a -q --filter "name=peer.*" --filter "name=orderer.*" --filter "name=ca.*" --filter "name=dev-peer.*" --filter "name=ccenv.*" --filter "name=couchdb.*" --filter "name=${PROXY_CONTAINER_NAME}.*") 2>/dev/null || true
    docker network rm fabric_test 2>/dev/null || true
}

# --- State Check Functions ---
function is_fabric_installed() { [ -d "$FABRIC_SAMPLE_DIR" ]; }

# --- Setup Functions ---
function install_fabric() {
	infoln "Downloading and installing Fabric samples..."
	(cd "$ROOTDIR" && curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh && chmod +x install-fabric.sh && ./install-fabric.sh)
	if [ $? -ne 0 ]; then errorln "Fabric installation failed."; fi
	rm "$ROOTDIR/install-fabric.sh"
	successln "Fabric samples installed."
}

function setup_proxy_service() {
	local ADMIN_MSP_DIR="$TEST_NETWORK_DIR/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
	local PEER_TLS_CERT="$TEST_NETWORK_DIR/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
	local ADMIN_CERT="${ADMIN_MSP_DIR}/signcerts/cert.pem"
	local ADMIN_KEY_DIR="${ADMIN_MSP_DIR}/keystore"

	infoln "Waiting for admin credentials..."
	for i in {1..30}; do
        ADMIN_KEY=$(find "${ADMIN_KEY_DIR}" -type f -name "*_sk" 2>/dev/null | head -n 1)
        if [ -f "$ADMIN_CERT" ] && [ -n "$ADMIN_KEY" ]; then break; fi
        echo -n "."
        sleep 1
    done
    echo ""
    if [ ! -f "$ADMIN_CERT" ] || [ -z "$ADMIN_KEY" ]; then errorln "Admin credentials not found."; fi
	successln "Admin credentials found."

	mkdir -p "$PROXY_CERTS_DIR"
	cp "$PEER_TLS_CERT" "$PROXY_CERTS_DIR/tlsca-cert.pem"
	cp "$ADMIN_CERT" "$PROXY_CERTS_DIR/admin-cert.pem"
	cp "$ADMIN_KEY" "$PROXY_CERTS_DIR/admin-key.sk"
	successln "Copied credentials to proxy staging directory."

	cat <<EOF >"$PROXY_COMPOSE_FILE"
version: '3.8'
services:
  grpcwebproxy:
    image: $PROXY_IMAGE
    container_name: $PROXY_CONTAINER_NAME
    ports: ["$PROXY_LISTEN_PORT:8088"]
    environment:
      - SERVER_ALLOWED_ORIGINS=*
      - FABRIC_GATEWAY_ADDRESS=peer0.org1.example.com:$PROXY_GRPC_PORT
      - FABRIC_TLS_ENABLED=true
      - FABRIC_TLS_CA_CERT_PATH=/certs/tlsca-cert.pem
      - FABRIC_TLS_CLIENT_CERT_PATH=/certs/admin-cert.pem
      - FABRIC_TLS_CLIENT_KEY_PATH=/certs/admin-key.sk
    volumes: ["$PROXY_CERTS_DIR:/certs:ro"]
    networks: [fabric_test]
networks:
  fabric_test:
    external: true
EOF

	infoln "Starting gRPC-Web proxy..."
	(cd "$ROOTDIR" && docker compose -f "$PROXY_COMPOSE_FILE" up -d)
}

function generate_credentials_file() {
	local OUTPUT_FILE="$ROOTDIR/test/test-credentials.ts"
	infoln "Generating test credentials file..."
	local CERT_PEM=$(cat "$PROXY_CERTS_DIR/admin-cert.pem")
	local KEY_PEM=$(cat "$PROXY_CERTS_DIR/admin-key.sk")
	cat <<EOF >"$OUTPUT_FILE"
// This file is auto-generated. Do not edit.
export const testCredentials = {
  certPem: `$CERT_PEM`,
  keyPem: `$KEY_PEM`,
};
EOF
	successln "Test credentials file generated: $OUTPUT_FILE"
}

function network_up() {
    network_down
	if ! is_fabric_installed; then install_fabric; fi

	cd "$TEST_NETWORK_DIR"
	infoln "Starting Fabric test network..."
	./network.sh up createChannel -ca -s couchdb || errorln "Failed to start Fabric network."
	infoln "Deploying chaincode..."
	./network.sh deployCC -ccn "$CHAINCODE_NAME" -ccp "$CHAINCODE_PKG_PATH" -ccl "$CHAINCODE_LANG" || errorln "Failed to deploy chaincode."

	cd "$ROOTDIR"
	setup_proxy_service
	generate_credentials_file

	successln "Fabric test network setup complete!"
}

function network_down() {
	infoln "Tearing down network..."
	if [ -f "$PROXY_COMPOSE_FILE" ]; then
		(cd "$ROOTDIR" && docker compose -f "$PROXY_COMPOSE_FILE" down --volumes 2>/dev/null)
		rm "$PROXY_COMPOSE_FILE"
	fi
	if [ -d "$TEST_NETWORK_DIR" ]; then
		(cd "$TEST_NETWORK_DIR" && ./network.sh down 2>/dev/null)
	fi
	cleanup_docker
	rm -rf "$PROXY_CERTS_DIR"
	rm -f "$ROOTDIR/test/test-credentials.ts"
	successln "Cleanup complete."
}

# --- Main Execution ---
if ! command -v docker &>/dev/null; then errorln "Docker is not installed."; fi
if ! docker info >/dev/null 2>&1; then errorln "Docker daemon is not running."; fi

COMMAND=$1

case "$COMMAND" in
	up) network_up ;;
	down) network_down ;;
	*) echo "Usage: $0 {up|down}"; exit 1 ;;
esac