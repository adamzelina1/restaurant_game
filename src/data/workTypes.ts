import type { Priority, Skill, WorkType } from '../sim/state';

export interface WorkTypeDef {
  id: WorkType;
  label: string;
  description: string;
  /** Skills shown in the priority grid cell (best one is displayed). */
  skills: Skill[];
}

export const WORK_TYPE_DEFS: Record<WorkType, WorkTypeDef> = {
  Cook: { id: 'Cook', label: 'Cook', description: 'Load stations, tend active recipes', skills: ['Grill', 'Saute', 'Baking'] },
  Prep: { id: 'Prep', label: 'Prep', description: 'Cutting board and mixing bench', skills: ['Prep', 'Baking'] },
  Plate: { id: 'Plate', label: 'Plate', description: 'Plate servings at the pass', skills: ['Plating'] },
  Orders: { id: 'Orders', label: 'Orders', description: 'Take orders at tables', skills: ['Service'] },
  Serve: { id: 'Serve', label: 'Serve', description: 'Carry plates to tables', skills: ['Service'] },
  Haul: { id: 'Haul', label: 'Haul', description: 'Fetch ingredients, carry finished batches', skills: [] },
  Bus: { id: 'Bus', label: 'Bus', description: 'Clear dirty tables', skills: [] },
  Dishes: { id: 'Dishes', label: 'Dishes', description: 'Wash dishes at the dish pit', skills: [] },
};

export interface PresetDef {
  id: string;
  name: string;
  priorities: Record<WorkType, Priority>;
}

export const PRESETS: PresetDef[] = [
  {
    id: 'lineCook', name: 'Line Cook',
    priorities: { Cook: 1, Prep: 2, Plate: 3, Orders: 0, Serve: 0, Haul: 3, Bus: 0, Dishes: 0 },
  },
  {
    id: 'prepCook', name: 'Prep Cook',
    priorities: { Cook: 2, Prep: 1, Plate: 3, Orders: 0, Serve: 0, Haul: 2, Bus: 0, Dishes: 0 },
  },
  {
    id: 'waiter', name: 'Waiter',
    priorities: { Cook: 0, Prep: 0, Plate: 2, Orders: 1, Serve: 1, Haul: 4, Bus: 3, Dishes: 0 },
  },
  {
    id: 'busser', name: 'Busser / Dishwasher',
    priorities: { Cook: 0, Prep: 0, Plate: 0, Orders: 0, Serve: 3, Haul: 2, Bus: 1, Dishes: 1 },
  },
  {
    id: 'jack', name: 'Jack of all trades',
    priorities: { Cook: 2, Prep: 2, Plate: 2, Orders: 2, Serve: 2, Haul: 2, Bus: 2, Dishes: 2 },
  },
];

export const PRESET_BY_ID: Record<string, PresetDef> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
