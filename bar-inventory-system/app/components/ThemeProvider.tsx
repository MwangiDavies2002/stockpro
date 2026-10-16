 'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import {applyTheme,DEFAULT_THEME,validColor} from '../lib/theme';
const Context=createContext({color:DEFAULT_THEME,choose:(_color:string)=>{}});
export const useTheme=()=>useContext(Context);
export function AccountTheme({color}:{color?:string|null}){const {choose}=useTheme();useEffect(()=>{choose(color&&validColor(color)?color:localStorage.getItem('stockpro_theme_color')||DEFAULT_THEME);},[color]);return null;}
export default function ThemeProvider({children}:{children:React.ReactNode}){
 const [color,setColor]=useState(DEFAULT_THEME);
 function choose(value:string){if(!validColor(value))return;const next=value.toLowerCase();setColor(next);applyTheme(next);try{localStorage.setItem('stockpro_theme_color',next);}catch{}}
 useEffect(()=>{choose(localStorage.getItem('stockpro_theme_color')||DEFAULT_THEME);},[]);
 return <Context.Provider value={{color,choose}}>{children}</Context.Provider>;
}
