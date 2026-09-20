import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        let code = 'VALIDATION_ERROR';

        if (firstIssue.path.includes('to')) {
          code = 'INVALID_PHONE_NUMBER';
        } else if (firstIssue.path.includes('message')) {
          code = 'INVALID_MESSAGE';
        }

        const customError: any = new Error(firstIssue.message);
        customError.code = code;
        return next(customError);
      }
      next(err);
    }
  };
}
