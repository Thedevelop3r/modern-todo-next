const { UserController } = require("./User.controller");
const { TodoController } = require("./Todo.controller");
const { TrashController } = require("./Trash.controller");
const { StatsController } = require("./Stats.controller");
const { ProjectController } = require("./Project.controller");
const { ActivityController, CommentController } = require("./Activity.controller");
const { AccountController } = require("./Account.controller");
const { SecurityController } = require("./Security.controller");
const { FontController } = require("./Font.controller");
const {
  SavedViewController,
  TemplateController,
  TagController,
} = require("./Library.controller");

module.exports = {
  UserController,
  TodoController,
  TrashController,
  StatsController,
  ProjectController,
  ActivityController,
  CommentController,
  SavedViewController,
  TemplateController,
  TagController,
  AccountController,
  SecurityController,
  FontController,
};
