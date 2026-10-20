import {toast} from 'sonner';

let audio: HTMLAudioElement | null = null;
function playPop() {
  try {
    if (!audio) audio = new Audio('/pop.mp3');
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {}
}

export function showDone(description?:string){
  playPop();
  toast.success('Saved',{
    id:'operation-done',description,duration:2500,position:'top-right',
  });
}
