import {toast} from 'sonner';
export function showDone(description?:string){
  toast.success('DONE!',{
    id:'operation-done',description,duration:2000,position:'top-right',
    style:{background:'#16a34a',color:'#fff',border:'1px solid #15803d',boxShadow:'0 8px 24px rgba(21,128,61,0.2)'},
  });
}
