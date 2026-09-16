/**
 * 时光 Flux - 场景工坊 · 场景装配
 * 集中登记所有内置场景，返回填好的 SceneRegistry。
 * 以后加场景(面试冲刺/简历包装…) = 在这里多 register 一个。
 */
import { SceneRegistry } from "./registry.js";
import { videoWorkshopScene } from "./videoWorkshop.js";

export function sceneRegistry(): SceneRegistry {
  const r = new SceneRegistry();
  r.register(videoWorkshopScene);
  return r;
}

export type { SceneDef, SceneParamsSchema } from "./types.js";
export { SceneRegistry } from "./registry.js";
