export const DEFAULT_THEME='#354f43';
export const validColor=(value:string)=>/^#[0-9a-f]{6}$/i.test(value);
const rgb=(color:string)=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
const mix=(a:number[],b:number[],weight:number)=>a.map((v,i)=>Math.round(v*(1-weight)+b[i]*weight));
const luminance=(c:number[])=>c.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
const contrast=(a:number[],b:number[])=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
export function onColor(color:string){const c=rgb(color);return contrast(c,[255,255,255])>=contrast(c,[0,0,0])?'#ffffff':'#000000';}
export function themeVariables(color:string){
 const hex=validColor(color)?color.toLowerCase():DEFAULT_THEME,c=rgb(hex),vars:Record<string,string>={'--brand-rgb':c.join(' '),'--chart-accent':hex,'--brand-on':onColor(hex)};
 const weights:Record<string,number>={50:.96,100:.91,200:.8,300:.62,400:.4,500:.15,600:0,700:-.15,800:-.3,900:-.5,950:-.65};
 for(const [shade,weight]of Object.entries(weights)){const value=mix(c,weight>=0?[255,255,255]:[0,0,0],Math.abs(weight));vars[`--theme-${shade}`]=value.join(' ');vars[`--theme-on-${shade}`]=contrast(value,[255,255,255])>=contrast(value,[0,0,0])?'#ffffff':'#000000';}
 let ink=c;for(let i=0;i<10&&contrast(ink,[250,248,242])<4.5;i++)ink=mix(ink,[0,0,0],.15);
 vars['--chart-accent']=`rgb(${ink.join(' ')})`;vars['--brand-ink-rgb']=ink.join(' ');vars['--brand-dark-rgb']=vars['--theme-700'];vars['--brand-soft-rgb']=vars['--theme-100'];
 return vars;
}
export function applyTheme(color:string){const vars=themeVariables(color);for(const [key,value]of Object.entries(vars))document.documentElement.style.setProperty(key,value);document.querySelector('meta[name="theme-color"]')?.setAttribute('content',validColor(color)?color:DEFAULT_THEME);}
