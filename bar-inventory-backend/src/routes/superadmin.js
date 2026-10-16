const router=require('express').Router();
const jwt=require('jsonwebtoken');
const database=require('../config/db');
const {authenticate}=require('../middleware/auth');
router.use(authenticate);
router.use(async(req,res,next)=>{try{const db={query:database.query,getClient:async()=>{const client=await database.getClient();return {...client,lockClause:' FOR UPDATE'};}};const data=await require('../services/platform').dispatch(db,req.user,req.method,'/superadmin'+req.path,req.body,req.query,{hashPassword:password=>require('bcryptjs').hash(password,12),createSupport:(target,session)=>({token:jwt.sign({id:target.id,business_id:target.business_id,role:target.role,support_session_id:session.id},process.env.JWT_SECRET,{expiresIn:'20m'}),session})});res.status(req.method==='POST'&&req.path==='/businesses'?201:200).json(data);}catch(e){next(e);}});
module.exports=router;
