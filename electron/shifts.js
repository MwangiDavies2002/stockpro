function durationFor(db,businessId){
  try{const settings=JSON.parse(db.prepare('SELECT settings_json FROM businesses WHERE id=?').get(businessId)?.settings_json||'{}'),hours=Number(settings.shiftDurationHours??12);return Number.isInteger(hours)&&hours>=1&&hours<=72?hours:12;}catch{return 12;}
}
function expire(db,businessId,shift){
  const hours=Number(shift.duration_hours)||12,opened=Date.parse(String(shift.opened_at||'').replace(' ','T'));
  if(!Number.isFinite(opened)||Date.now()<opened+hours*3600000)return false;
  const cash=Number(db.prepare("SELECT COALESCE(SUM(total),0) total FROM sales WHERE business_id=? AND shift_id=? AND payment_method='cash'").get(businessId,shift.id)?.total||0),expected=Number(shift.opening_float)+cash;
  const updated=db.prepare("UPDATE shifts SET closing_expected=?,closing_actual=NULL,expected_cash=?,actual_cash=NULL,variance=NULL,closed_at=CURRENT_TIMESTAMP,status='closed',notes=? WHERE id=? AND business_id=? AND status='open'").run(expected,expected,'Automatically closed after configured duration; cash count not recorded',shift.id,businessId);
  return updated.changes>0;
}
function sweep(db){
  return db.transaction(()=>{
    let closed=0;const shifts=db.prepare("SELECT * FROM shifts WHERE status='open'").all();
    for(const shift of shifts)if(expire(db,shift.business_id,shift))closed++;
    return closed;
  })();
}
module.exports={durationFor,expire,sweep};
