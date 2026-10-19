import { Router, type Request, type Response, type NextFunction } from "express";
import { userService, HttpError } from "./user.service.js";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function parseId(raw: string | string[]): number {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid user ID.");
  return id;
}

router.post("/", asyncHandler(async (req, res) => {
  res.status(201).json(await userService.createUser(req.body));
}));

router.get("/", asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  res.json(await userService.listUsers(limit, offset));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  res.json(await userService.getUser(parseId(req.params.id)));
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  res.json(await userService.updateUser(parseId(req.params.id), req.body));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  await userService.deleteUser(parseId(req.params.id));
  res.status(204).send();
}));

router.get("/:id/skills", asyncHandler(async (req, res) => {
  res.json(await userService.getUserSkills(parseId(req.params.id)));
}));

router.put("/:id/skills", asyncHandler(async (req, res) => {
  res.json(await userService.setUserSkills(parseId(req.params.id), req.body));
}));

export default router;