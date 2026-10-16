import {toast} from 'sonner';
export function showDone(description?:string){
  toast.success('Saved',{
    id:'operation-done',description,duration:2000,position:'top-right',
    style:{background:'#faf8f2',color:'#292e29',border:'1px solid #c8c5b8'},
  });
}
