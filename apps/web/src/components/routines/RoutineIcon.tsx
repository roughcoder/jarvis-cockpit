import {
  ActivityIcon,
  GitPullRequestIcon,
  ListChecksIcon,
  RocketIcon,
  SunriseIcon,
} from "lucide-react";

import type { RoutineIconName } from "./routineCatalog";

const iconByName = {
  brief: SunriseIcon,
  health: ActivityIcon,
  "pull-request": GitPullRequestIcon,
  release: RocketIcon,
  triage: ListChecksIcon,
} satisfies Record<RoutineIconName, typeof ActivityIcon>;

export function RoutineIcon({ name, className }: { name: RoutineIconName; className?: string }) {
  const Icon = iconByName[name];
  return <Icon aria-hidden="true" className={className} />;
}
