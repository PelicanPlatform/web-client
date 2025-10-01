export class UnauthenticatedError extends Error {
	constructor(message: string | undefined) {
		super(message);
		this.name = this.constructor.name;
	}
}

export default UnauthenticatedError;
