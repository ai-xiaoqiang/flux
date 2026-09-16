/**
 * 时光 Flux - 场景工坊 · 场景注册表
 * 登记/按 id 取/列出全部场景（仿 ToolRegistry 的思路，防重名）。
 */
import type { SceneDef } from "./types.js";

export class SceneRegistry {
  private map = new Map<string, SceneDef>();

  register(scene: SceneDef): void {
    if (this.map.has(scene.id)) {
      throw new Error(`场景 ${scene.id} 已存在，请勿重复注册`);
    }
    this.map.set(scene.id, scene);
  }

  get(id: string): SceneDef | undefined {
    return this.map.get(id);
  }

  all(): SceneDef[] {
    return [...this.map.values()];
  }
}
