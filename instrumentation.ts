export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkEnvironment } = await import("./lib/diagnostics");
    checkEnvironment();
  }
}