import { create, protoInt64, toBinary } from "@bufbuild/protobuf";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import {
  ChannelHeaderSchema,
  Envelope,
  EnvelopeSchema,
  HeaderSchema,
  HeaderType,
  PayloadSchema,
  SignatureHeaderSchema,
} from "../generated_protos/common/common_pb";
import {
  SeekInfoSchema,
  SeekNewestSchema,
  SeekPosition,
  SeekPositionSchema,
  SeekSpecifiedSchema,
} from "../generated_protos/orderer/ab_pb";
import { AppIdentity, BlockEventParams } from "../models";
import { generateTransactionId } from "./builder";
import { signEnvelope } from "../crypto/signing";

interface DeliverRequestParams extends BlockEventParams {
  identity: AppIdentity;
  mspId: string;
}

/**
 * Builds and signs a `Deliver` request to get a filtered block stream.
 * This request is sent directly to the `DeliverFiltered` service of the Peer (through the WebSocket proxy).
 * @param params The request details.
 * @returns A signed `Envelope` containing the `DELIVER_SEEK_INFO` request.
 */
export async function createSignedDeliverRequest(
  params: DeliverRequestParams,
): Promise<Envelope> {
  const { txId, nonce, creatorBytes } = await generateTransactionId(
    params.identity,
    params.mspId,
  );

  let startPosition: SeekPosition;

  if (typeof params.startBlock === "bigint") {
    startPosition = create(SeekPositionSchema, {
      Type: {
        case: "specified",
        value: create(SeekSpecifiedSchema, { number: params.startBlock }),
      },
    });
  } else {
    startPosition = create(SeekPositionSchema, {
      Type: { case: "newest", value: create(SeekNewestSchema, {}) },
    });
  }

  // We always request "infinity" for a continuous stream.
  const stopPosition = create(SeekPositionSchema, {
    Type: {
      case: "specified",
      value: create(SeekSpecifiedSchema, {
        number: protoInt64.parse(Number.MAX_SAFE_INTEGER.toString()),
      }),
    },
  });

  const seekInfo = create(SeekInfoSchema, {
    start: startPosition,
    stop: stopPosition,
    behavior: 0,
  });

  const channelHeader = create(ChannelHeaderSchema, {
    type: HeaderType.DELIVER_SEEK_INFO,
    version: 0,
    channelId: params.channelName,
    txId: txId,
    epoch: protoInt64.parse(0),
    timestamp: create(TimestampSchema, {
      seconds: BigInt(Math.floor(Date.now() / 1000)), // Seconds as BigInt
      nanos: (Date.now() % 1000) * 1_000_000, // Nanoseconds
    }),
  });

  const signatureHeader = create(SignatureHeaderSchema, {
    creator: creatorBytes,
    nonce,
  });

  const payload = create(PayloadSchema, {
    header: create(HeaderSchema, {
      channelHeader: toBinary(ChannelHeaderSchema, channelHeader),
      signatureHeader: toBinary(SignatureHeaderSchema, signatureHeader),
    }),
    data: toBinary(SeekInfoSchema, seekInfo),
  });
  const payloadBytes = toBinary(PayloadSchema, payload);

  const signature = await signEnvelope(payloadBytes, params.identity);

  return create(EnvelopeSchema, { payload: payloadBytes, signature });
}
