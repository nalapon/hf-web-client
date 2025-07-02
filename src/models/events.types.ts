export type EventCallback<T> = (data: T) => void;
export type ErrorCallback = (error: Error) => void;
export type CloseCallback = () => void;

export interface EventCallbacks<T> {
  onData: EventCallback<T>;
  onError: ErrorCallback;
  onClose?: CloseCallback;
}
