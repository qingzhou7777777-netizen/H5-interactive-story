export function isStaticDeployment() {
  return import.meta.env.VITE_STATIC_MODE === "true";
}
