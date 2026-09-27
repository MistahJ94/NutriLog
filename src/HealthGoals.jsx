import { useEffect, useMemo, useState } from 'react'
import { Target, Scale, Save, Calculator, CheckCircle2 } from 'lucide-react'
import { api } from './services'

const KG_PER_LB = 0.45359237
const activityOptions = [
  ['sedentary','Sedentary','Little or no exercise'],
  ['lightly_active','Lightly Active','Light exercise 1–3 days/week'],
  ['moderately_active','Moderately Active','Moderate exercise 3–5 days/week'],
  ['very_active','Very Active','Hard exercise 6–7 days/week'],
  ['extremely_active','Extremely Active','Very hard training or physical job']
]

const empty = {
  age: '', sex: 'unspecified', heightFt: '', heightIn: '', weightLb: '', goalWeightLb: '',
  activityLevel: 'moderately_active', goalType: 'lose', desiredRateLbs: '1'
}

const formatDate = value => {
  const raw = String(value || '').slice(0, 10)
  const date = new Date(raw + 'T12:00:00')
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString()
}

const calculate = p => {
  const age=Number(p.age), heightCm=(Number(p.heightFt)*30.48)+(Number(p.heightIn)*2.54)
  const weightKg=Number(p.weightLb)*KG_PER_LB, goalKg=Number(p.goalWeightLb)*KG_PER_LB
  let bmr=10*weightKg+6.25*heightCm-5*age
  if(p.sex==='male') bmr+=5
  else if(p.sex==='female') bmr-=161
  else bmr-=78
  const factor={sedentary:1.2,lightly_active:1.375,moderately_active:1.55,very_active:1.725,extremely_active:1.9}[p.activityLevel]||1.55
  const maintenance=Math.round(bmr*factor)
  const adjustment=Math.round(Number(p.desiredRateLbs||0)*500)
  const calories=Math.max(1200,maintenance+(p.goalType==='lose'?-adjustment:p.goalType==='gain'?adjustment:0))
  const protein=Math.round(Math.min(2.2,Math.max(.8,1.6))*goalKg)
  const fat=Math.round(calories*.25/9)
  const fiber=Math.round(calories/1000*14)
  const carbs=Math.max(0,Math.round((calories-protein*4-fat*9)/4))
  const bmi=weightKg/(heightCm/100)**2
  const change=Math.abs(Number(p.goalWeightLb)-Number(p.weightLb))
  const weeks=(p.goalType!=='maintain'&&Number(p.desiredRateLbs)>0)?change/Number(p.desiredRateLbs):null
  return {bmr:Math.round(bmr),maintenance,calories,protein,carbs,fat,fiber,bmi:Number(bmi.toFixed(1)),change,weeks}
}

export default function HealthGoals() {
  const [form,setForm]=useState(empty)
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [profile,setProfile]=useState(null); const [recommendations,setRecommendations]=useState(null)
  const [weight,setWeight]=useState(''); const [weightSaving,setWeightSaving]=useState(false); const [weights,setWeights]=useState([])
  const update=(name,value)=>setForm(p=>({...p,[name]:value}))
  const rec=useMemo(()=>form.age&&form.heightFt&&form.weightLb&&form.goalWeightLb?calculate(form):null,[form])
  const load=async()=>{try{const [h,w]=await Promise.all([api.health.get(),api.weight.list()]); if(h.profile){const cm=Number(h.profile.heightCm);setForm({age:String(h.profile.age),sex:h.profile.sex,heightFt:String(Math.floor(cm/30.48)),heightIn:String(Math.round((cm/2.54)%12)),weightLb:String((Number(h.profile.currentWeightKg)/KG_PER_LB).toFixed(1)),goalWeightLb:String((Number(h.profile.goalWeightKg)/KG_PER_LB).toFixed(1)),activityLevel:h.profile.activityLevel,goalType:h.profile.goalType,desiredRateLbs:String(h.profile.desiredRateLbs)});setProfile(h.profile);setRecommendations(h.recommendations)} setWeights(w.entries||[])}catch(e){alert(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[])
  const save=async()=>{if(!rec)return;setSaving(true);try{const payload={age:Number(form.age),sex:form.sex,heightCm:Number(form.heightFt)*30.48+Number(form.heightIn)*2.54,currentWeightKg:Number(form.weightLb)*KG_PER_LB,goalWeightKg:Number(form.goalWeightLb)*KG_PER_LB,activityLevel:form.activityLevel,goalType:form.goalType,desiredRateLbs:Number(form.goalType==='maintain'?0:form.desiredRateLbs)};const r=await api.health.save(payload);setProfile(r.profile);setRecommendations(r.recommendations);await api.goals.save({calories:r.recommendations.suggestedCalories,protein:r.recommendations.protein,carbs:r.recommendations.carbs,fat:r.recommendations.fat,fiber:r.recommendations.fiber});alert('Health profile saved and your nutrition goals were updated.')}catch(e){alert(e.message)}finally{setSaving(false)}}
  const saveWeight=async()=>{const kg=Number(weight)*KG_PER_LB;if(!kg)return;setWeightSaving(true);try{await api.weight.create({weightKg:kg});setWeight('');await load()}catch(e){alert(e.message)}finally{setWeightSaving(false)}}
  if(loading)return <div className="section"><p>Loading health profile…</p></div>
  return <div className="health-page">
    <div className="planner-intro"><h2>Health & Goals</h2><p>Build a starting calorie and macro target from your age, height, weight, goal, and activity level.</p></div>
    <div className="health-grid">
      <div className="section">
        <h3><Calculator size={20}/> Your Profile</h3>
        <div className="form-row"><div className="form-group"><label>Age<input type="number" min="20" max="120" value={form.age} onChange={e=>update('age',e.target.value)}/></label></div><div className="form-group"><label>Sex<select value={form.sex} onChange={e=>update('sex',e.target.value)}><option value="unspecified">Prefer not to specify</option><option value="female">Female</option><option value="male">Male</option></select></label></div></div>
        <div className="form-row"><div className="form-group"><label>Height<input type="number" min="2" step=".1" placeholder="ft" value={form.heightFt} onChange={e=>update('heightFt',e.target.value)}/></label></div><div className="form-group"><label>Height inches<input type="number" min="0" max="11.99" step=".1" value={form.heightIn} onChange={e=>update('heightIn',e.target.value)}/></label></div></div>
        <div className="form-row"><div className="form-group"><label>Current weight (lb)<input type="number" min="44" step=".1" value={form.weightLb} onChange={e=>update('weightLb',e.target.value)}/></label></div><div className="form-group"><label>Goal weight (lb)<input type="number" min="44" step=".1" value={form.goalWeightLb} onChange={e=>update('goalWeightLb',e.target.value)}/></label></div></div>
        <div className="form-group"><label>Activity level<select value={form.activityLevel} onChange={e=>update('activityLevel',e.target.value)}>{activityOptions.map(x=><option key={x[0]} value={x[0]}>{x[1]} — {x[2]}</option>)}</select></label></div>
        <div className="form-row"><div className="form-group"><label>Goal<select value={form.goalType} onChange={e=>update('goalType',e.target.value)}><option value="lose">Lose weight</option><option value="maintain">Maintain weight</option><option value="gain">Gain weight</option></select></label></div><div className="form-group"><label>Rate (lb/week)<select value={form.desiredRateLbs} disabled={form.goalType==='maintain'} onChange={e=>update('desiredRateLbs',e.target.value)}><option value="0.5">0.5</option><option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option></select></label></div></div>
        <button className="btn btn-primary" onClick={save} disabled={!rec||saving}><Save size={18}/>{saving?'Saving…':'Save Profile & Apply Goals'}</button>
      </div>
      <div className="section">
        <h3><Target size={20}/> Recommendation</h3>
        {rec?<div className="recommendation-grid"><div><strong>BMR</strong><span>{rec.bmr} kcal</span></div><div><strong>Maintenance</strong><span>{rec.maintenance} kcal</span></div><div><strong>Suggested Calories</strong><span>{rec.calories} kcal</span></div><div><strong>Protein</strong><span>{rec.protein} g</span></div><div><strong>Carbs</strong><span>{rec.carbs} g</span></div><div><strong>Fat</strong><span>{rec.fat} g</span></div><div><strong>Fiber</strong><span>{rec.fiber} g</span></div><div><strong>BMI</strong><span>{rec.bmi}</span></div><div><strong>Goal</strong><span>{rec.change.toFixed(1)} lb {form.goalType==='maintain'?'to maintain':'to '+form.goalType}</span></div>{rec.weeks&&<div><strong>Estimated timeframe</strong><span>~{rec.weeks.toFixed(1)} weeks</span></div>}</div>:<p>Enter your profile to see an estimate.</p>}
        <div className="info-box"><CheckCircle2 size={18}/><span>These are starting estimates, not medical advice. Individual needs can vary.</span></div>
      </div>
    </div>
    <div className="section">
      <h3><Scale size={20}/> Weight Tracking</h3>
      <div className="form-row"><div className="form-group"><label>Current weight (lb)<input type="number" min="44" step=".1" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="e.g. 215.4"/></label></div><div className="form-group weight-action"><button className="btn btn-primary" onClick={saveWeight} disabled={!weight||weightSaving}>Log Weight</button></div></div>
      <div className="weight-history">{weights.slice(0,10).map(w=><div key={w.id}><span>{formatDate(w.recorded_at)}</span><strong>{(Number(w.weight_kg)/KG_PER_LB).toFixed(1)} lb</strong></div>)}{!weights.length&&<p>No weight entries yet.</p>}</div>
    </div>
  </div>
}
