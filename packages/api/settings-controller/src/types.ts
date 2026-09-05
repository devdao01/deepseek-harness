/**
 * Browser-safe failure vocabulary of the configuration surfaces this package
 * serves. The redacted views themselves live with their seam in
 * `@deepseek-ai/dsh-settings/types`, whose Cordis event declarations already
 * register that file for the Client compilation face.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/types
 */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /**
     * Every seam refusal that is not a stale write: an unregistered or malformed
     * namespace, a read-only provider, schema validation, storage.
     */
    'settings/rejected': { readonly ns: string }
    /**
     * The stored revision moved after the caller read it. Its own outcome rather
     * than an invalid request: the caller must re-read and re-apply.
     */
    'settings/conflict': { readonly ns: string; readonly expected: number; readonly actual: number }
    /**
     * The provider refused a valid credential write, for example because a
     * read-only source shadows the reference. The details name only the
     * reference, never the value.
     */
    'credential/rejected': { readonly ref: string }
  }
}

/** Confirmation that the settings document was handed to the native editor. */
export interface SettingsDocumentOpenValue {
  readonly opened: true
}

/** Result of opening or revealing one locally authored Agent preset directory. */
export type AgentPresetDirectoryOpenValue =
  | { readonly opened: true }
  | { readonly opened: false; readonly path: string }

/** Stable credential failure details returned by the `credentials` namespace. */
export interface CredentialErrorDetailsMap {
  /**
   * The provider refused a valid write, for example because a read-only source
   * shadows the reference. The details name only the reference, never the value.
   */
  'credential-rejected': { readonly ref: string }
}

/** Credential business failure carried by a rejected Remote call. */
export type CredentialError = {
  [Code in keyof CredentialErrorDetailsMap]: {
    readonly code: Code
    readonly message: string
    readonly details: CredentialErrorDetailsMap[Code]
  }
}[keyof CredentialErrorDetailsMap]

/** One choice of a `select` authorization prompt, as a surface reads it. */
export interface AuthorizationPromptOptionView {
  /** Value returned when this option is chosen. */
  readonly id: string
  /** User-facing label. */
  readonly label: string
  /** Optional extra context. */
  readonly description?: string
}

/** An authorization prompt the flow is waiting on, as a surface reads it. */
export type AuthorizationPromptView =
  | { readonly kind: 'text' | 'secret'; readonly message: string; readonly placeholder?: string }
  | { readonly kind: 'select'; readonly message: string; readonly options: readonly AuthorizationPromptOptionView[] }

/** One flow a surface can offer to run. */
export interface AuthorizationFlowView {
  /** The credential record this flow writes. */
  readonly key: string
  /** User-facing name of what is being authorized. */
  readonly label: string
  /** The methods offered, most preferred first. */
  readonly methods: readonly { readonly id: string; readonly label: string }[]
  /** Whether an attempt for this key is already running. */
  readonly inFlight: boolean
}

/** The flows this deployment can authorize. */
export interface AuthorizationListValue {
  /** One entry per registered flow; empty when no authorization seam is mounted. */
  readonly flows: readonly AuthorizationFlowView[]
}

/** The started attempt's handle. */
export interface AuthorizationBeginValue {
  /** The id polled and responded to for this attempt. */
  readonly attemptId: string
}

/** One poll of an attempt: notices drained since the last poll, the pending prompt, the outcome. */
export interface AuthorizationAttemptState {
  /** Progress/notice messages emitted since the previous poll (each may carry a url/code). */
  readonly notices: readonly { readonly message: string; readonly url?: string; readonly code?: string }[]
  /** The question the flow is blocked on (e.g. paste your code); absent when none pending. */
  readonly prompt?: { readonly id: string } & AuthorizationPromptView
  /** How the attempt ended; absent while still running. */
  readonly settled?: { readonly status: 'authorized' | 'cancelled' | 'failed'; readonly message?: string }
}
