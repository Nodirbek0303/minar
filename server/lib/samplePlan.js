// Demo uchun namuna plan: 10x8 m 2-qavatli uy, 4 xona, eshik va derazalar bilan.
export function samplePlan() {
  const H = 3.0;
  const floors = [
    { id: 'f1', name: '1-qavat', height: H, facade: true },
    { id: 'f2', name: '2-qavat', height: H, facade: true }
  ];
  const walls = [
    { id: 'w1', a: [0, 0], b: [10, 0], thickness: 0.3, height: H, type: 'exterior' },
    { id: 'w2', a: [10, 0], b: [10, 8], thickness: 0.3, height: H, type: 'exterior' },
    { id: 'w3', a: [10, 8], b: [0, 8], thickness: 0.3, height: H, type: 'exterior' },
    { id: 'w4', a: [0, 8], b: [0, 0], thickness: 0.3, height: H, type: 'exterior' },
    { id: 'w5', a: [5, 0], b: [5, 4.5], thickness: 0.15, height: H, type: 'interior' },
    { id: 'w6', a: [5, 4.5], b: [0, 4.5], thickness: 0.15, height: H, type: 'interior' },
    { id: 'w7', a: [5, 4.5], b: [7.5, 4.5], thickness: 0.15, height: H, type: 'interior' },
    { id: 'w8', a: [7.5, 4.5], b: [7.5, 8], thickness: 0.15, height: H, type: 'interior' },
    { id: 'w9', a: [7.5, 4.5], b: [10, 4.5], thickness: 0.15, height: H, type: 'interior' }
  ];
  const openings = [
    { id: 'd1', wallId: 'w1', type: 'door', offset: 1.2, width: 1.0, height: 2.1, sill: 0 },
    { id: 'd2', wallId: 'w6', type: 'door', offset: 2.0, width: 0.9, height: 2.1, sill: 0 },
    { id: 'd3', wallId: 'w5', type: 'door', offset: 1.5, width: 0.9, height: 2.1, sill: 0 },
    { id: 'd4', wallId: 'w7', type: 'door', offset: 0.8, width: 0.9, height: 2.1, sill: 0 },
    { id: 'w5o', wallId: 'w1', type: 'window', offset: 6.5, width: 1.6, height: 1.4, sill: 0.9 },
    { id: 'w6o', wallId: 'w2', type: 'window', offset: 2.5, width: 1.4, height: 1.4, sill: 0.9 },
    { id: 'w7o', wallId: 'w2', type: 'window', offset: 5.5, width: 1.4, height: 1.4, sill: 0.9 },
    { id: 'w8o', wallId: 'w3', type: 'window', offset: 2.5, width: 1.6, height: 1.4, sill: 0.9 },
    { id: 'w9o', wallId: 'w3', type: 'window', offset: 6.5, width: 1.6, height: 1.4, sill: 0.9 },
    { id: 'w10o', wallId: 'w4', type: 'window', offset: 2.0, width: 1.4, height: 1.4, sill: 0.9 },
    { id: 'w11o', wallId: 'w4', type: 'window', offset: 5.0, width: 1.4, height: 1.4, sill: 0.9 }
  ];
  const rooms = [
    { id: 'r1', name: 'Yotoqxona', polygon: [[0, 0], [5, 0], [5, 4.5], [0, 4.5]] },
    { id: 'r2', name: 'Oshxona', polygon: [[5, 0], [10, 0], [10, 4.5], [7.5, 4.5], [5, 4.5]] },
    { id: 'r3', name: 'Mehmonxona', polygon: [[0, 4.5], [5, 4.5], [5, 8], [0, 8]] },
    { id: 'r4', name: 'Kabinet', polygon: [[7.5, 4.5], [10, 4.5], [10, 8], [7.5, 8]] }
  ];
  return {
    meta: { name: 'Namuna uy 10x8', source: 'demo', units: 'm', level: '1-qavat' },
    floors, walls, openings, rooms
  };
}
