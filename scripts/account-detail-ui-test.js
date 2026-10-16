const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../bar-inventory-system/node_modules');
const ts=require(path.join(root,'typescript')),React=require(path.join(root,'react')),render=require(path.join(root,'react-dom/server')).renderToStaticMarkup;
const source=fs.readFileSync(path.join(__dirname,'../bar-inventory-system/app/components/accounting/AccountDetailSelect.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const output={exports:{}};new Function('require','exports',compiled)(name=>require(path.join(root,name)),output.exports);
const {default:Select,filterDetailTypes}=output.exports;
const catalog=require('../bar-inventory-system/app/lib/accountTypes.json');
test('every account detail across all five account types is rendered as a selectable option',()=>{
 for(const options of Object.values(catalog).flatMap(type=>Object.values(type))){const html=render(React.createElement(Select,{options,value:'',onChange:()=>{}}));
  for(const option of options)assert.ok(html.includes('value="'+option.replace(/'/g,'&#x27;')+'"'),option);
  assert.ok(html.includes('type="search"'));assert.ok(html.includes('required=""'));
 }
});
test('detail search is insensitive to case and keeps the current selection',()=>{
 const options=catalog.Expenses['Cost of sales'];assert.deepEqual(filterDetailTypes(options,'  FREIGHT '),['Freight and delivery - COS']);
 assert.deepEqual(filterDetailTypes(options,'missing'),[]);assert.deepEqual(filterDetailTypes(options,'missing','Cost of labour - COS'),['Cost of labour - COS']);
});
test('detail selector is disabled before choosing a subtype',()=>{
 assert.ok(render(React.createElement(Select,{options:[],value:'',disabled:true,onChange:()=>{}})).includes('disabled=""'));
});

test('Liabilities contains all four referenced subtypes and its payable detail',()=>{
 assert.deepEqual(Object.keys(catalog.Liabilities),['Accounts Payable (A/P)','Credit Card','Current liabilities','Non-current liabilities']);
 assert.deepEqual(catalog.Liabilities['Accounts Payable (A/P)'],['Accounts Payable (A/P)']);
});
