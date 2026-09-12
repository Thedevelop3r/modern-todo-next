const { User } = require("./User.model");
const { Todo } = require("./Todo.model");
const { Trash } = require("./Trash.model");
const { Project } = require("./Project.model");
const { Comment } = require("./Comment.model");
const { Activity } = require("./Activity.model");
const { SavedView } = require("./SavedView.model");
const { Template } = require("./Template.model");
const { AuditLog } = require("./AuditLog.model");
const { StoredFile } = require("./StoredFile.model");
const { GeneratedPdf } = require("./GeneratedPdf.model");

module.exports = {
  User,
  Todo,
  Trash,
  Project,
  Comment,
  Activity,
  SavedView,
  Template,
  AuditLog,
  StoredFile,
  GeneratedPdf,
};
