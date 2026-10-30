 'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import {applyTheme,DEFAULT_THEME,validColor} from '../lib/theme';
type ThemeContextValue={color:string;choose:(color:string)=>void;darkMode:boolean;toggleDarkMode:()=>void};
const Context=createContext<ThemeContextValue>({color:DEFAULT_THEME,choose:()=>{},darkMode:false,toggleDarkMode:()=>{}});
export const useTheme=()=>useContext(Context);
export function AccountTheme({color}:{color?:string|null}){const {choose}=useTheme();useEffect(()=>{choose(color&&validColor(color)?color:localStorage.getItem('stockpro_theme_color')||DEFAULT_THEME);},[color]);return null;}
export default function ThemeProvider({children}:{children:React.ReactNode}){
 const [color,setColor]=useState(DEFAULT_THEME);
 const [darkMode,setDarkMode]=useState(false);
 function choose(value:string){if(!validColor(value))return;const next=value.toLowerCase();setColor(next);applyTheme(next);try{localStorage.setItem('stockpro_theme_color',next);}catch{}}
 function toggleDarkMode(){setDarkMode(current=>{const next=!current;try{localStorage.setItem('stockpro_dark_mode',String(next));}catch{}document.documentElement.dataset.themeMode=next?'dark':'light';return next;});}
 useEffect(()=>{choose(localStorage.getItem('stockpro_theme_color')||DEFAULT_THEME);const dark=localStorage.getItem('stockpro_dark_mode')==='true';setDarkMode(dark);document.documentElement.dataset.themeMode=dark?'dark':'light';},[]);
 return <Context.Provider value={{color,choose,darkMode,toggleDarkMode}}>{children}</Context.Provider>;
}
