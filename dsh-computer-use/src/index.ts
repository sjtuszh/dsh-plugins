/**
 * Public entry: the Computer Use capability seam (Service Definition).
 *
 * The package root default-export is the Service class, so a bare
 * `name: dsh-computer-use` row mounts `ctx.computerUse`. The tool/provider
 * consumer lives at `dsh-computer-use/plugin`.
 * @module dsh-computer-use
 */

export { ComputerUseRuntime, ComputerUseRuntime as default } from './service.ts'
export { ComputerUseError, COMPUTER_USE_ERROR_CODES } from './errors.ts'
export type { ComputerUseErrorCode } from './errors.ts'
export { COMPUTER_USE_EVENT_TYPES } from './events.ts'
export { applyApprovalGate } from './policy.ts'
export type { ApprovalGateConfig } from './policy.ts'
export { perceiveAccessibility } from './core.ts'
export { perceiveWithVision, applyPerceiveTool } from './perception.ts'
export type { PerceptionRoute } from './perception.ts'
export { requiresApproval, riskLevelOfActionType } from './risk.ts'
export type { RiskLevel } from './risk.ts'
export { encodeFrame, decodeFrame, MAX_FRAME_BYTES } from './native/framing.ts'
export { PROTOCOL_VERSION, NATIVE_METHODS } from './native/protocol.ts'
export type { NativeMethod, NativeRequest, NativeResponse, NativeEvent } from './native/protocol.ts'
export { NativeHelperTransport } from './native/transport.ts'
export type { Connection } from './native/transport.ts'
export { PipeConnection } from './native/connection.ts'
export { WindowsComputerUseProvider } from './providers/windows.ts'
export type { WindowsProviderOptions } from './providers/windows.ts'
export {
  FakeComputerUseProvider,
} from './providers/fake.ts'
export {
  RECOMMENDED_VISION_MODEL,
  VISION_MODEL_ALTERNATIVES,
  RECOMMENDED_VISION_ROUTE,
  VISION_GUIDANCE,
} from './vision.ts'
export type { VisionRouteProfile } from './vision.ts'
export type {
  ActRequest,
  ComputerUseAccessibility,
  ComputerUseAction,
  ComputerUseElement,
  ComputerUseObservation,
  ComputerUseProvider,
  ComputerUseScreenshot,
  ComputerUseSession,
  ComputerUseTarget,
  ObserveRequest,
  PerceivedElement,
  PerceptionResult,
  Point,
  Rect,
  StartRequest,
  StopRequest,
} from './types.ts'
export type {
  ComputerUseElementId,
  ComputerUseObservationId,
  ComputerUseScreenshotId,
  ComputerUseSessionId,
  ComputerUseTargetId,
} from './ids.ts'
