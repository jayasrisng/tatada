export const onboardingKey=(workspace:string)=>`${workspace}:onboarding`
export function readOnboarding(workspace:string):number|null{
 try{const value=sessionStorage.getItem(onboardingKey(workspace));if(value===null)return null;const index=Number(value);return Number.isInteger(index)&&index>=0&&index<5?index:null}catch{return null}
}
export function saveOnboarding(workspace:string,index:number){try{sessionStorage.setItem(onboardingKey(workspace),String(index))}catch{/* Guide still works for this visit. */}}
export function clearOnboarding(workspace:string){try{sessionStorage.removeItem(onboardingKey(workspace))}catch{/* No saved guide. */}}
