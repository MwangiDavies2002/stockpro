export type Permission = { view: 'none'|'own'|'all'; create: boolean; update: boolean; delete: boolean; payments: boolean; price: boolean; discount: boolean; export: boolean };
export type Package = {id: string;name: string;price: number;maxLocations: number|null;maxMembers: number|null;modules: string[]};
export type Access = {owner:boolean;themeColor?:string|null;superadmin?:boolean;businessStatus?:string;subscriptionRequired?:boolean;supportSession?:any;plan:Package;roleName:string;locationIds:number[]|null;permissions:Record<string,Permission>};
export function pageModule(path:string):string|null {
 if(path==='/'||/^\/(reports|insights|notifications|staff-performance)/.test(path))return 'reports';
 if(/^\/(accounts|account|accounting|treasury)(\/|$)/.test(path))return 'accounting';
 if(/^\/(inventory|setup|stock-transfers|stock-adjustments)(\/|$)/.test(path))return 'inventory';
 if(/^\/(sales|sales-ar)(\/|$)/.test(path))return 'sales';
 if(path.startsWith('/purchases')||path.startsWith('/orders'))return 'purchases';
 if(path.startsWith('/business/settings'))return 'settings';
 if(path.startsWith('/payments'))return 'payments';
 if(path.startsWith('/network'))return 'network';
 if(path.startsWith('/supermarket'))return 'supermarket';
 if(path.startsWith('/fleet'))return 'fleet';
 return ['expenses','pos','customers','suppliers','locations','users','roles','discounts','loyalty'].find(key=>path===`/${key}`||path.startsWith(`/${key}/`))||null;
}
export function canVisit(access:Access|undefined,path:string){
 if(!access)return false;
 if(path.startsWith('/superadmin'))return !!access.superadmin;
 if(access.businessStatus==='suspended')return false;
 if(path.startsWith('/subscription/manage'))return !!access.superadmin;
 if(path.startsWith('/subscription'))return access.owner;
 if(access.subscriptionRequired)return false;
 const module=pageModule(path);if(!module)return true;
 if(['accounting','users','roles'].includes(module)&&!access.owner)return false;
 return access.plan.modules.includes(module)&&!!access.permissions[module]&&access.permissions[module].view!=='none';
}
export function canAct(access:Access|undefined,module:string,action:keyof Permission){return !!access?.plan.modules.includes(module)&&!!access.permissions[module]?.[action]&&access.permissions[module][action]!=='none';}
