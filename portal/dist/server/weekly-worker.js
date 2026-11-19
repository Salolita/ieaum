import { rpc } from "./portal-store.js";
function automationReady() {
  return rpc("portal_valid_week_worker", { p_key: "" }).then(() => true, () => false);
}
export {
  automationReady
};
