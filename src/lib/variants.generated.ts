/*
 * GENERATED FILE - do not edit by hand.
 *
 * Written by scripts/generate-variants.mjs from shared/variants/*.json, which
 * server/config/variants.js reads directly. Run `npm run variants` after
 * editing a variant.
 */

import type { Variant } from "./variants.ts";

export const DEFAULT_VARIANT_ID = "general";

export const VARIANT_CATALOGUE: Variant[] = [
  {
    "id": "general",
    "label": "General",
    "description": "The application as it comes: todos, projects, templates and tags.",
    "icon": "check-square",
    "capabilities": [],
    "terms": {
      "todo": {
        "one": "Todo",
        "many": "Todos"
      },
      "project": {
        "one": "Project",
        "many": "Projects"
      },
      "template": {
        "one": "Template",
        "many": "Templates"
      },
      "tag": {
        "one": "Tag",
        "many": "Tags"
      }
    },
    "statusLabels": {
      "pending": "Pending",
      "progress": "In progress",
      "completed": "Completed"
    },
    "priorityLabels": {
      "none": "None",
      "low": "Low",
      "medium": "Medium",
      "high": "High",
      "urgent": "Urgent"
    },
    "pdfTemplate": "general",
    "pdfHighlights": [],
    "todoFields": [],
    "projectFields": [],
    "pages": [],
    "seedTemplates": []
  },
  {
    "id": "school",
    "label": "School",
    "description": "Assignments with courses, weights and scores, plus a gradebook.",
    "icon": "graduation-cap",
    "capabilities": [
      "grading"
    ],
    "terms": {
      "todo": {
        "one": "Assignment",
        "many": "Assignments"
      },
      "project": {
        "one": "Course",
        "many": "Courses"
      },
      "template": {
        "one": "Template",
        "many": "Templates"
      },
      "tag": {
        "one": "Subject",
        "many": "Subjects"
      }
    },
    "statusLabels": {
      "pending": "Not started",
      "progress": "In progress",
      "completed": "Submitted"
    },
    "priorityLabels": {
      "none": "None",
      "low": "Low",
      "medium": "Medium",
      "high": "High",
      "urgent": "Urgent"
    },
    "pdfTemplate": "school",
    "pdfHighlights": [
      "score",
      "maxScore",
      "weight"
    ],
    "todoFields": [
      {
        "key": "course",
        "label": "Course",
        "type": "string",
        "max": 60,
        "placeholder": "Physics"
      },
      {
        "key": "gradeLevel",
        "label": "Grade level",
        "type": "string",
        "max": 20,
        "placeholder": "Year 11"
      },
      {
        "key": "assignmentType",
        "label": "Assignment type",
        "type": "enum",
        "options": [
          {
            "value": "homework",
            "label": "Homework"
          },
          {
            "value": "essay",
            "label": "Essay"
          },
          {
            "value": "project",
            "label": "Project"
          },
          {
            "value": "lab",
            "label": "Lab report"
          },
          {
            "value": "quiz",
            "label": "Quiz"
          },
          {
            "value": "exam",
            "label": "Exam"
          }
        ]
      },
      {
        "key": "weight",
        "label": "Weight",
        "type": "number",
        "min": 0,
        "max": 100,
        "hint": "Share of the course grade, as a percentage."
      },
      {
        "key": "maxScore",
        "label": "Maximum score",
        "type": "number",
        "min": 0,
        "max": 10000
      },
      {
        "key": "score",
        "label": "Score",
        "type": "number",
        "min": 0,
        "max": 10000,
        "hint": "Left blank until it comes back marked."
      },
      {
        "key": "submittedAt",
        "label": "Submitted",
        "type": "date"
      }
    ],
    "projectFields": [
      {
        "key": "subject",
        "label": "Subject",
        "type": "string",
        "max": 60,
        "placeholder": "Sciences"
      },
      {
        "key": "teacher",
        "label": "Teacher",
        "type": "string",
        "max": 60
      },
      {
        "key": "term",
        "label": "Term",
        "type": "enum",
        "options": [
          {
            "value": "autumn",
            "label": "Autumn"
          },
          {
            "value": "spring",
            "label": "Spring"
          },
          {
            "value": "summer",
            "label": "Summer"
          }
        ]
      },
      {
        "key": "room",
        "label": "Room",
        "type": "string",
        "max": 20
      }
    ],
    "pages": [
      {
        "id": "courses",
        "label": "Courses",
        "icon": "graduation-cap",
        "kind": "group",
        "groupBy": "course",
        "emptyLabel": "No course set",
        "description": "Every assignment, grouped by the course it belongs to."
      },
      {
        "id": "gradebook",
        "label": "Gradebook",
        "icon": "chart",
        "kind": "scoreboard",
        "groupBy": "course",
        "scoreField": "score",
        "maxField": "maxScore",
        "weightField": "weight",
        "description": "Weighted grade per course, and how much of each course is still outstanding."
      }
    ],
    "seedTemplates": [
      {
        "name": "Essay",
        "title": "Essay: ",
        "description": "Thesis, sources, draft, final read-through."
      },
      {
        "name": "Lab report",
        "title": "Lab report: ",
        "description": "Method, results, analysis, conclusion."
      },
      {
        "name": "Revision block",
        "title": "Revise ",
        "description": "Two hours, past papers, then a summary sheet."
      }
    ]
  },
  {
    "id": "law-enforcement",
    "label": "Law Enforcement",
    "description": "Cases with classifications, units and an evidence trail.",
    "icon": "shield",
    "capabilities": [
      "custody",
      "banner"
    ],
    "terms": {
      "todo": {
        "one": "Case",
        "many": "Cases"
      },
      "project": {
        "one": "Operation",
        "many": "Operations"
      },
      "template": {
        "one": "Template",
        "many": "Templates"
      },
      "tag": {
        "one": "Flag",
        "many": "Flags"
      }
    },
    "statusLabels": {
      "pending": "Open",
      "progress": "Active",
      "completed": "Closed"
    },
    "priorityLabels": {
      "none": "Routine",
      "low": "Low",
      "medium": "Medium",
      "high": "High",
      "urgent": "Critical"
    },
    "pdfTemplate": "law-enforcement",
    "pdfHighlights": [
      "caseNumber",
      "classification",
      "incidentTime"
    ],
    "pdfBannerField": "confidentiality",
    "todoFields": [
      {
        "key": "caseNumber",
        "label": "Case number",
        "type": "string",
        "max": 40,
        "placeholder": "2026-004821"
      },
      {
        "key": "classification",
        "label": "Classification",
        "type": "enum",
        "options": [
          {
            "value": "theft",
            "label": "Theft"
          },
          {
            "value": "assault",
            "label": "Assault"
          },
          {
            "value": "fraud",
            "label": "Fraud"
          },
          {
            "value": "narcotics",
            "label": "Narcotics"
          },
          {
            "value": "traffic",
            "label": "Traffic"
          },
          {
            "value": "public-order",
            "label": "Public order"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "confidentiality",
        "label": "Handling",
        "type": "enum",
        "hint": "Printed as a banner on every page of this case's PDF.",
        "options": [
          {
            "value": "unrestricted",
            "label": "Unrestricted"
          },
          {
            "value": "official",
            "label": "Official"
          },
          {
            "value": "sensitive",
            "label": "Official — Sensitive"
          },
          {
            "value": "restricted",
            "label": "Restricted"
          }
        ]
      },
      {
        "key": "unit",
        "label": "Unit",
        "type": "string",
        "max": 60,
        "placeholder": "CID"
      },
      {
        "key": "badge",
        "label": "Officer",
        "type": "string",
        "max": 40,
        "placeholder": "Badge number"
      },
      {
        "key": "location",
        "label": "Location",
        "type": "string",
        "max": 120
      },
      {
        "key": "incidentTime",
        "label": "Incident",
        "type": "date"
      }
    ],
    "projectFields": [
      {
        "key": "operationCode",
        "label": "Operation code",
        "type": "string",
        "max": 40
      },
      {
        "key": "leadUnit",
        "label": "Lead unit",
        "type": "string",
        "max": 60
      },
      {
        "key": "commander",
        "label": "Commander",
        "type": "string",
        "max": 60
      },
      {
        "key": "openedAt",
        "label": "Opened",
        "type": "date"
      }
    ],
    "pages": [
      {
        "id": "cases",
        "label": "Cases",
        "icon": "shield",
        "kind": "group",
        "groupBy": "caseNumber",
        "emptyLabel": "No case number",
        "description": "Every case, grouped by its case number."
      },
      {
        "id": "evidence",
        "label": "Evidence",
        "icon": "clipboard",
        "kind": "files",
        "groupBy": "caseNumber",
        "description": "Every stored exhibit, with the chain of custody behind it."
      }
    ],
    "seedTemplates": [
      {
        "name": "Incident report",
        "title": "Incident: ",
        "description": "Time, location, parties, account, actions taken."
      },
      {
        "name": "Witness statement",
        "title": "Statement: ",
        "description": "Who, when, what they saw, contact details, signature."
      },
      {
        "name": "Evidence log",
        "title": "Evidence: ",
        "description": "Item, where seized, by whom, where stored."
      }
    ]
  },
  {
    "id": "hospital",
    "label": "Hospital",
    "description": "Ward tasks by patient reference, triage severity and shift.",
    "notice": {
      "title": "A task manager, not a medical record",
      "body": "This application is not an EHR and is not a medical device. Do not record clinical findings, diagnoses or patient names here - use a patient reference. File reads are not audited."
    },
    "icon": "stethoscope",
    "capabilities": [
      "disclaimer"
    ],
    "terms": {
      "todo": {
        "one": "Task",
        "many": "Tasks"
      },
      "project": {
        "one": "Ward",
        "many": "Wards"
      },
      "template": {
        "one": "Protocol",
        "many": "Protocols"
      },
      "tag": {
        "one": "Flag",
        "many": "Flags"
      }
    },
    "statusLabels": {
      "pending": "To do",
      "progress": "In progress",
      "completed": "Done"
    },
    "priorityLabels": {
      "none": "Routine",
      "low": "Low",
      "medium": "Standard",
      "high": "Urgent",
      "urgent": "Immediate"
    },
    "pdfTemplate": "hospital",
    "pdfHighlights": [
      "patientRef",
      "triage",
      "dueWindow"
    ],
    "pdfBannerField": "confidentialityNote",
    "todoFields": [
      {
        "key": "patientRef",
        "label": "Patient reference",
        "type": "string",
        "max": 40,
        "placeholder": "MRN or local reference",
        "hint": "A reference, never a name. This app is not a medical record."
      },
      {
        "key": "ward",
        "label": "Ward",
        "type": "string",
        "max": 40
      },
      {
        "key": "bed",
        "label": "Bed",
        "type": "string",
        "max": 20
      },
      {
        "key": "triage",
        "label": "Triage",
        "type": "enum",
        "options": [
          {
            "value": "immediate",
            "label": "Immediate"
          },
          {
            "value": "urgent",
            "label": "Urgent"
          },
          {
            "value": "standard",
            "label": "Standard"
          },
          {
            "value": "non-urgent",
            "label": "Non-urgent"
          }
        ]
      },
      {
        "key": "careType",
        "label": "Care type",
        "type": "enum",
        "options": [
          {
            "value": "observation",
            "label": "Observation"
          },
          {
            "value": "medication",
            "label": "Medication"
          },
          {
            "value": "procedure",
            "label": "Procedure"
          },
          {
            "value": "review",
            "label": "Review"
          },
          {
            "value": "discharge",
            "label": "Discharge"
          },
          {
            "value": "transfer",
            "label": "Transfer"
          }
        ]
      },
      {
        "key": "dueWindow",
        "label": "Due window",
        "type": "enum",
        "options": [
          {
            "value": "this-shift",
            "label": "This shift"
          },
          {
            "value": "next-shift",
            "label": "Next shift"
          },
          {
            "value": "today",
            "label": "Today"
          },
          {
            "value": "24h",
            "label": "Within 24 hours"
          }
        ]
      },
      {
        "key": "confidentialityNote",
        "label": "Handling",
        "type": "enum",
        "hint": "Printed as a banner on every page of this task's PDF.",
        "options": [
          {
            "value": "internal",
            "label": "Internal use only"
          },
          {
            "value": "confidential",
            "label": "Confidential — patient identifiable"
          }
        ]
      }
    ],
    "projectFields": [
      {
        "key": "wardCode",
        "label": "Ward code",
        "type": "string",
        "max": 20
      },
      {
        "key": "speciality",
        "label": "Speciality",
        "type": "string",
        "max": 60
      },
      {
        "key": "chargeNurse",
        "label": "Charge nurse",
        "type": "string",
        "max": 60
      },
      {
        "key": "beds",
        "label": "Beds",
        "type": "number",
        "min": 0,
        "max": 500
      }
    ],
    "pages": [
      {
        "id": "wards",
        "label": "Wards",
        "icon": "stethoscope",
        "kind": "group",
        "groupBy": "ward",
        "emptyLabel": "No ward set",
        "description": "Every task, grouped by the ward it belongs to."
      },
      {
        "id": "handover",
        "label": "Shift handover",
        "icon": "clipboard",
        "kind": "group",
        "groupBy": "dueWindow",
        "emptyLabel": "No window set",
        "description": "What is outstanding, grouped by when it is due."
      }
    ],
    "seedTemplates": [
      {
        "name": "Observations round",
        "title": "Obs: ",
        "description": "Vitals, escalation threshold, who to call."
      },
      {
        "name": "Medication round",
        "title": "Meds: ",
        "description": "Chart checked, allergies checked, second signature."
      },
      {
        "name": "Discharge checklist",
        "title": "Discharge: ",
        "description": "Summary, medicines, transport, follow-up."
      }
    ]
  },
  {
    "id": "restaurant",
    "label": "Restaurant",
    "description": "Prep by station and shift, with par levels, suppliers and allergens.",
    "icon": "utensils-crossed",
    "capabilities": [
      "ordering"
    ],
    "terms": {
      "todo": {
        "one": "Prep",
        "many": "Prep"
      },
      "project": {
        "one": "Station",
        "many": "Stations"
      },
      "template": {
        "one": "Recipe",
        "many": "Recipes"
      },
      "tag": {
        "one": "Label",
        "many": "Labels"
      }
    },
    "statusLabels": {
      "pending": "To prep",
      "progress": "Prepping",
      "completed": "Ready"
    },
    "priorityLabels": {
      "none": "Routine",
      "low": "Low",
      "medium": "Standard",
      "high": "Push",
      "urgent": "Service critical"
    },
    "pdfTemplate": "restaurant",
    "pdfHighlights": [
      "station",
      "shift",
      "covers"
    ],
    "todoFields": [
      {
        "key": "station",
        "label": "Station",
        "type": "string",
        "max": 40,
        "placeholder": "Larder"
      },
      {
        "key": "shift",
        "label": "Shift",
        "type": "enum",
        "options": [
          {
            "value": "prep",
            "label": "Prep"
          },
          {
            "value": "lunch",
            "label": "Lunch"
          },
          {
            "value": "dinner",
            "label": "Dinner"
          },
          {
            "value": "close",
            "label": "Close"
          }
        ]
      },
      {
        "key": "covers",
        "label": "Covers",
        "type": "number",
        "min": 0,
        "max": 2000,
        "hint": "How many this batch is for."
      },
      {
        "key": "supplier",
        "label": "Supplier",
        "type": "string",
        "max": 60
      },
      {
        "key": "parLevel",
        "label": "Par level",
        "type": "number",
        "min": 0,
        "max": 10000
      },
      {
        "key": "onHand",
        "label": "On hand",
        "type": "number",
        "min": 0,
        "max": 10000
      },
      {
        "key": "allergens",
        "label": "Allergens",
        "type": "checklist",
        "hint": "Tick what this dish contains. Printed on the prep sheet."
      }
    ],
    "projectFields": [
      {
        "key": "stationCode",
        "label": "Station code",
        "type": "string",
        "max": 20
      },
      {
        "key": "chef",
        "label": "Section chef",
        "type": "string",
        "max": 60
      },
      {
        "key": "service",
        "label": "Service",
        "type": "enum",
        "options": [
          {
            "value": "breakfast",
            "label": "Breakfast"
          },
          {
            "value": "lunch",
            "label": "Lunch"
          },
          {
            "value": "dinner",
            "label": "Dinner"
          },
          {
            "value": "all-day",
            "label": "All day"
          }
        ]
      }
    ],
    "pages": [
      {
        "id": "stations",
        "label": "Stations",
        "icon": "utensils-crossed",
        "kind": "group",
        "groupBy": "station",
        "emptyLabel": "No station set",
        "description": "Everything to prep, grouped by the station that does it."
      },
      {
        "id": "prep-list",
        "label": "Prep list",
        "icon": "clipboard",
        "kind": "group",
        "groupBy": "shift",
        "emptyLabel": "No shift set",
        "description": "What each shift has to get through."
      },
      {
        "id": "orders",
        "label": "Orders",
        "icon": "clipboard",
        "kind": "stock",
        "groupBy": "supplier",
        "emptyLabel": "No supplier set",
        "parField": "parLevel",
        "onHandField": "onHand",
        "description": "What is below par, grouped by the supplier who fills it."
      }
    ],
    "seedTemplates": [
      {
        "name": "Mise en place",
        "title": "Mise: ",
        "description": "Cut, portion, label, date, store."
      },
      {
        "name": "Stock rotation",
        "title": "Rotate: ",
        "description": "FIFO, check dates, pull anything short."
      },
      {
        "name": "Deep clean",
        "title": "Clean: ",
        "description": "Strip, degrease, sanitise, sign off."
      }
    ]
  }
];
