// Fictional test-fleet tuning. SI units: kg, m/s, m/s², radians and newtons.
// The cars share a collision envelope so every course supports every vehicle.
export const VEHICLES = Object.freeze([
  Object.freeze({ id: 'roadster', name: '赤焰 Roadster', nameEn: 'APEX ROADSTER', subtitle: '轻快响应 · 空中特技',
    color: '#d92639', bodyStyle: 'roadster', mass: 1780, acceleration: 16.0, brake: 25.0, maxSpeed: 62,
    grip: 1.32, maxSteer: 0.48, steerResponse: 8.5, wheelbase: 2.88, cornering: 11.5, yawResponse: 6.5,
    suspensionRate: 65, suspensionDamping: 15, bodyRoll: 0.0075, bodyPitch: 0.0028,
    jetForce: 49840, rollTorque: 7.8, fuelBurn: 25, damageFactor: 1.0 }),
  Object.freeze({ id: 'coupe', name: '蔚蓝 GT', nameEn: 'VOLT GT', subtitle: '稳定巡航 · 均衡操控',
    color: '#2879db', bodyStyle: 'coupe', mass: 2070, acceleration: 13.0, brake: 24.0, maxSpeed: 58,
    grip: 1.24, maxSteer: 0.44, steerResponse: 6.5, wheelbase: 3.04, cornering: 12.8, yawResponse: 5.8,
    suspensionRate: 74, suspensionDamping: 17, bodyRoll: 0.0060, bodyPitch: 0.0023,
    jetForce: 55890, rollTorque: 6.8, fuelBurn: 24, damageFactor: 0.9 }),
  Object.freeze({ id: 'rally', name: '荒野 Rally', nameEn: 'TERRA RALLY', subtitle: '长行程悬挂 · 宽容落地',
    color: '#f17d32', bodyStyle: 'rally', mass: 1660, acceleration: 12.2, brake: 23.0, maxSpeed: 54,
    grip: 1.18, maxSteer: 0.52, steerResponse: 7.2, wheelbase: 2.78, cornering: 10.5, yawResponse: 6.2,
    suspensionRate: 49, suspensionDamping: 13, bodyRoll: 0.0100, bodyPitch: 0.0040,
    jetForce: 45650, rollTorque: 7.4, fuelBurn: 23, damageFactor: 0.66 }),
  Object.freeze({ id: 'prototype', name: '银翼 Prototype', nameEn: 'SILVER PROTOTYPE', subtitle: '低重心 · 高速性能',
    color: '#bbc6cf', bodyStyle: 'prototype', mass: 1490, acceleration: 18.0, brake: 28.0, maxSpeed: 74,
    grip: 1.55, maxSteer: 0.39, steerResponse: 9.0, wheelbase: 3.06, cornering: 14.0, yawResponse: 7.4,
    suspensionRate: 90, suspensionDamping: 18, bodyRoll: 0.0045, bodyPitch: 0.0018,
    jetForce: 43955, rollTorque: 8.0, fuelBurn: 27, damageFactor: 1.12 }),
]);

export function getVehicle(id = 'roadster') {
  return VEHICLES.find(vehicle => vehicle.id === id) ?? VEHICLES[0];
}
