import type { WorkType } from '../sim/state';

export interface WorkTypeDef {
  id: WorkType;
  label: string;
  description: string;
}

export const WORK_TYPE_DEFS: Record<WorkType, WorkTypeDef> = {
  Cook: { id: 'Cook', label: 'Cook', description: 'Load stations, tend active recipes' },
  Prep: { id: 'Prep', label: 'Prep', description: 'Cutting board and mixing bench' },
  Plate: { id: 'Plate', label: 'Plate', description: 'Plate servings at the pass' },
  Orders: { id: 'Orders', label: 'Orders', description: 'Take orders at tables' },
  Serve: { id: 'Serve', label: 'Serve', description: 'Carry plates to tables' },
  Haul: { id: 'Haul', label: 'Haul', description: 'Fetch ingredients, carry finished batches' },
  Bus: { id: 'Bus', label: 'Bus', description: 'Clear dirty tables' },
  Dishes: { id: 'Dishes', label: 'Dishes', description: 'Wash dishes at the dish pit' },
};
