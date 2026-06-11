export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  route: string | null;
  permission: string | null;
  actions: Record<string, boolean>;
  children?: MenuItem[];
}
