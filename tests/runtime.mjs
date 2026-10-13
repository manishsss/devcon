export const env = {};
export const backgroundTasks=[];
export function waitUntil(task){backgroundTasks.push(task);}
