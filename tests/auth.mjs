export const headers = async () => new Headers();
export const redirect = () => { throw new Error('Unexpected authentication redirect'); };
