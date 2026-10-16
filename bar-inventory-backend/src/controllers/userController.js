const bcrypt=require('bcryptjs');
const {query,getClient}=require('../config/db');
const {loadAccess,validateAssignments,saveAssignments,member}=require('../utils/accessService');
const {assertCapacity,fail}=require('../utils/accessPolicy');
const columns='id,business_id,name,email,username,role,is_owner,phone,active,created_at,access_role_id';
async function getAll(req,res,next){try{const {rows}=await query(`SELECT ${columns} FROM users WHERE business_id=? ORDER BY name`,[req.user.business_id]);res.json(await Promise.all(rows.map(r=>member(r))));}catch(e){next(e);}}
async function getOne(req,res,next){try{const {rows:[row]}=await query(`SELECT ${columns} FROM users WHERE id=? AND business_id=?`,[req.params.id,req.user.business_id]);if(!row)fail('Member not found',404);res.json(await member(row));}catch(e){next(e);}}
async function write(req,res,next){const db=await getClient();try{
 const bid=req.user.business_id,body=req.body,id=req.params.id;
 if(!req.user.is_owner)fail('Only the owner can manage members');
 if(!String(body.name||'').trim()||!String(body.email||'').trim())fail('Name and email are required',400);
 if(!id&&!body.password)fail('Password is required',400);
 if(body.password&&(body.password.length<10||!/[A-Z]/.test(body.password)||!/[a-z]/.test(body.password)||!/[0-9]/.test(body.password)))fail('Password must be at least 10 characters and include uppercase, lowercase, and a number',400);
 if(!['admin','employee'].includes(body.role||'employee'))fail('Invalid account role',400);
 await db.query('BEGIN');await db.query('SELECT id FROM businesses WHERE id=? FOR UPDATE',[bid]);
 const {rows:[target]}=id?await db.query('SELECT * FROM users WHERE id=? AND business_id=?',[id,bid]):{rows:[]};
 if(id&&!target)fail('Member not found',404);
 if(!id){const {rows:[count]}=await db.query('SELECT COUNT(*) count FROM users WHERE business_id=?',[bid]);assertCapacity((await loadAccess(req.user,db)).plan,'members',count.count);}
 if(target?.is_owner&&(body.active===false||body.role!=='admin'||body.accessRoleId))fail('The owner must remain an active administrator',400);
 const assignment=await validateAssignments(body,bid,db,!!target?.is_owner);
 const values=[body.name.trim(),body.email.trim(),body.role||'employee',body.phone||null];
 let savedId=id;
 if(id){await db.query('UPDATE users SET name=?,email=?,role=?,phone=?,active=? WHERE id=? AND business_id=?',[...values,body.active===false?0:1,id,bid]);if(body.password)await db.query('UPDATE users SET password=? WHERE id=? AND business_id=?',[await bcrypt.hash(body.password,12),id,bid]);}
 else savedId=(await db.query('INSERT INTO users (name,email,role,phone,business_id,password) VALUES (?,?,?,?,?,?)',[...values,bid,await bcrypt.hash(body.password,12)])).insertId;
 await saveAssignments(savedId,bid,assignment,db);await db.query('COMMIT');
 const {rows:[saved]}=await query(`SELECT ${columns} FROM users WHERE id=? AND business_id=?`,[savedId,bid]);res.status(id?200:201).json(await member(saved));
 }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'Email already registered'});next(e);}finally{db.release();}}
async function toggleActive(req,res,next){try{const {rows:[target]}=await query('SELECT * FROM users WHERE id=? AND business_id=?',[req.params.id,req.user.business_id]);if(!target)fail('Member not found',404);if(target.is_owner||Number(target.id)===Number(req.user.id))fail('The owner and your current account must stay active',400);await query('UPDATE users SET active=? WHERE id=? AND business_id=?',[target.active?0:1,target.id,req.user.business_id]);res.json(await member({...target,active:!target.active}));}catch(e){next(e);}}
async function remove(req,res,next){try{const {rows:[target]}=await query('SELECT id,is_owner FROM users WHERE id=? AND business_id=?',[req.params.id,req.user.business_id]);if(!target)fail('Member not found',404);if(target.is_owner||Number(target.id)===Number(req.user.id))fail('Cannot delete the business owner or your current account',400);await query('DELETE FROM users WHERE id=? AND business_id=?',[target.id,req.user.business_id]);await query('DELETE FROM user_locations WHERE user_id=? AND business_id=?',[target.id,req.user.business_id]);res.json({message:'Member removed'});}catch(e){next(e);}}
module.exports={getAll,getOne,create:write,update:write,toggleActive,remove};
