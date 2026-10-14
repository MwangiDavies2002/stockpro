type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function readQueue<T extends {localId:string}>(storage:Store,key:string):T[]{
  const raw=storage.getItem(key);if(!raw)return[];
  const value=JSON.parse(raw);
  if(!Array.isArray(value)||value.some(sale=>!sale||typeof sale.localId!=='string'))throw new Error('Saved offline sales need review; their data has been preserved');
  return value;
}
export function appendQueue<T extends {localId:string}>(storage:Store,key:string,sale:T):T[]{
  const current=readQueue<T>(storage,key);
  const result=current.some(item=>item.localId===sale.localId)?current:[...current,sale];
  storage.setItem(key,JSON.stringify(result));return result;
}
export function removeSynced<T extends {localId:string}>(storage:Store,key:string,ids:string[]):T[]{
  const accepted=new Set(ids);const current=readQueue<T>(storage,key).filter(sale=>!accepted.has(sale.localId));
  if(current.length)storage.setItem(key,JSON.stringify(current));else storage.removeItem(key);
  return current;
}
