export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
