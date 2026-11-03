export function countDays(start:string,end:string,counting:string,holidays:string[],weekdays:number[]=[1,2,3,4,5]){
 let total=0;
 for(const day=new Date(start+'T00:00:00Z'),last=new Date(end+'T00:00:00Z');day<=last;day.setUTCDate(day.getUTCDate()+1)){
  if(counting==='CALENDAR'||(weekdays.includes(day.getUTCDay())&&!holidays.includes(day.toISOString().slice(0,10))))total++;
 }
 return total;
}
