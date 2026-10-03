export class ActionError extends Error {}

export function actionErrorMessage(error: unknown) {
  return error instanceof ActionError ? error.message : "We could not complete that request. Please try again.";
}
