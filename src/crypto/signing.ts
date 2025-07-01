import BN from "bn.js";
import { AppIdentity } from "../models";
import { getSubtleCrypto } from "./crypto-provider";

// El "orden" de la curva P-256. Es un número primo constante.
const N = new BN(
  "ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
  16,
);
const HALF_N = N.shrn(1); // La mitad del orden para la comprobación de LOW-S

/**
 * Convierte una firma del formato R|S (concatenación) al formato DER.
 * Fabric requiere que las firmas estén codificadas en DER.
 */
function rsToDer(rs: Uint8Array): Uint8Array {
  const n = rs.length / 2;
  let r = rs.slice(0, n);
  let s = rs.slice(n);

  // Elimina los ceros iniciales (padding)
  while (r.length > 1 && r[0] === 0 && r[1] < 0x80) r = r.slice(1);
  while (s.length > 1 && s[0] === 0 && s[1] < 0x80) s = s.slice(1);

  // Añade un cero inicial si el número es negativo en formato de dos complementos
  if (r[0] >= 0x80) r = new Uint8Array([0, ...r]);
  if (s[0] >= 0x80) s = new Uint8Array([0, ...s]);

  const encoded = new Uint8Array([0x02, r.length, ...r, 0x02, s.length, ...s]);
  return new Uint8Array([0x30, encoded.length, ...encoded]);
}

/**
 * Normaliza el componente S de una firma ECDSA para prevenir la maleabilidad.
 * Si S > N/2, se reemplaza por N-S.
 */
function preventMalleability(signature: Uint8Array): Uint8Array {
  const r = signature.slice(0, signature.length / 2);
  let s = signature.slice(signature.length / 2);

  const sBN = new BN(s);
  if (sBN.cmp(HALF_N) > 0) {
    const newS = N.sub(sBN);
    s = new Uint8Array(newS.toArray("be", 32)); // Big-endian, 32 bytes
  }

  return new Uint8Array([...r, ...s]);
}

/**
 * A generic signing function that takes data, an active identity, and returns
 * a DER-encoded, low-S signature ready for Fabric.
 * @param dataToSign The bytes that need a signature.
 * @param identity The active identity object with its `.sign()` method.
 */
export async function signFabricSignature(
  dataToSign: Uint8Array,
  identity: AppIdentity,
): Promise<Uint8Array> {
  // 1. Use the identity's own sign method to get the raw signature from the worker.
  const rawSignature = await identity.sign(dataToSign);

  // 2. Apply security and formatting rules.
  const lowSSignature = preventMalleability(rawSignature);
  return rsToDer(lowSSignature);
}

/**
 * @deprecated Use signFabricSignature instead.
 */
export async function signProposal(
  proposalBytes: Uint8Array,
  identity: AppIdentity,
): Promise<Uint8Array> {
  return signFabricSignature(proposalBytes, identity);
}

/**
 * @deprecated Use signFabricSignature instead.
 */
export async function signEnvelope(
  envelopePayload: Uint8Array,
  identity: AppIdentity,
): Promise<Uint8Array> {
  return signFabricSignature(envelopePayload, identity);
}
