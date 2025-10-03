export function madFilter(values, k=3) {
  if (values.length < 5) return values;
  const median = q50(values);
  const dev = values.map(v => Math.abs(v - median));
  const mad = q50(dev) || 1e-9;
  const thresh = k * 1.4826 * mad;
  return values.filter(v => Math.abs(v - median) <= thresh);
}
export function q50(arr){
  const a=[...arr].sort((a,b)=>a-b);
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
export function circularMeanCents(centsArray){
  if (!centsArray.length) return null;
  let x=0,y=0;
  for (const c of centsArray){
    const rad = 2*Math.PI*(c/1200);
    x += Math.cos(rad);
    y += Math.sin(rad);
  }
  const mean = Math.atan2(y,x); // -π..π
  let cent = (mean/(2*Math.PI))*1200;
  if (cent<0) cent += 1200;
  return cent;
}