import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// --- Configuración ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const protosRoot = path.join(projectRoot, "fabric-protos"); // Directorio con los .proto
const outDir = path.join(projectRoot, "src", "generated_protos");
const protocPath = path.join(projectRoot, "node_modules", ".bin", "protoc");
const configFile = path.join(projectRoot, "buf.gen.yaml");

// --- Lógica del Script ---
try {
  console.log("🚀 Iniciando la generación de código Protobuf...");

  if (!fs.existsSync(protocPath)) {
    throw new Error(`Compilador de protoc no encontrado en: ${protocPath}`);
  }
  if (!fs.existsSync(protosRoot)) {
    throw new Error(
      `Directorio de fabric-protos no encontrado en: ${protosRoot}`,
    );
  }
  if (!fs.existsSync(configFile)) {
    throw new Error(
      `Archivo de configuración buf.gen.yaml no encontrado en: ${configFile}`,
    );
  }

  if (fs.existsSync(outDir)) {
    console.log(`🧹 Limpiando directorio de salida: ${outDir}`);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // protoc usa el archivo de configuración para encontrar los plugins y opciones.
  // Solo necesitamos decirle dónde están los archivos .proto.
  const command = [
    `"${protocPath}"`,
    `--proto_path="${protosRoot}"`,
    `--config="${configFile}"`,
    // Escanea recursivamente todos los archivos .proto en el directorio raíz de protos
    ...findProtoFilesRecursive(protosRoot).map((file) => `"${file}"`),
  ].join(" ");

  console.log("🛠️  Ejecutando protoc...");
  execSync(command, { stdio: "inherit", cwd: projectRoot });

  console.log("\n✅ ¡Generación de código Protobuf completada con éxito!");
} catch (error) {
  console.error("\n❌ [ERROR] Falló la generación de código Protobuf.");
  console.error(error.message);
  process.exit(1);
}

// --- Función de utilidad para encontrar archivos .proto ---
function findProtoFilesRecursive(dir) {
  let protoFiles = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Excluimos directorios que no nos interesan
      if (entry.name !== "google" && entry.name !== "bindings") {
        protoFiles = protoFiles.concat(findProtoFilesRecursive(fullPath));
      }
    } else if (entry.name.endsWith(".proto")) {
      protoFiles.push(fullPath);
    }
  }
  return protoFiles;
}
