const router=require('express').Router();
const {authenticate}=require('../middleware/auth');
const {query}=require('../config/db');
const {getBusinessId}=require('../utils/tenant');
router.use(authenticate);
router.get('/',async(req,res,next)=>{try{res.json((await query('SELECT * FROM notifications WHERE business_id=? ORDER BY id DESC LIMIT 100',[getBusinessId(req)])).rows);}catch(error){next(error);}});
router.patch('/:id/read',async(req,res,next)=>{try{const result=await query('UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=? AND business_id=?',[req.params.id,getBusinessId(req)]);if(!result.rowCount)return res.status(404).json({message:'Notification not found'});res.json({success:true});}catch(error){next(error);}});
module.exports=router;
