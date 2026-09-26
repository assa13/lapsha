// Three.js requires WebGL 2. A missing/blocked driver is a normal capability
// failure, so do not construct a renderer until a context actually exists.
export function requestGraphicsContext(canvas){
  const profiles=[
    {alpha:true,antialias:true,powerPreference:'default'},
    {alpha:false,antialias:false,powerPreference:'default'},
    {alpha:false,antialias:false,powerPreference:'low-power'},
  ];
  for(const profile of profiles){
    try{
      const context=canvas.getContext('webgl2',{...profile,depth:true,stencil:false,preserveDrawingBuffer:false,failIfMajorPerformanceCaveat:false});
      if(context)return {context,antialias:profile.antialias};
    }catch{/* Some browsers throw instead of returning null when GL is blocked. */}
  }
  return null;
}
