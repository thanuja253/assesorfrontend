import type { AssessorProfileFileKey } from "@/lib/assessor-profile-api";
import type { AssessorProfileFormValues } from "@/lib/assessor-profile-map";
import { pickStr } from "@/lib/assessor-profile-map";
import { isValidEmailFormat } from "@/lib/validation";

/** Document rows that can be gated by Laravel-style `*_doccheck === "2"` hidden fields. */
export type DocStatusFileKey = Exclude<
  AssessorProfileFileKey,
  "profile_image"
>;

export const DOC_STATUS_FORM_KEYS: Record<DocStatusFileKey, string> = {
  biodata: "biodatadoccheck",
  cancelled_cheque: "chequedoccheck",
  gst_declaration: "gstdoccheck",
  vendor_registration_form: "vrfoccheck",
  non_disclosure_agreement: "ndcdoccheck",
  health_declaration: "healthdoccheck",
  pan_card: "pandoccheck",
};

export function emptyDocCheckStatuses(): Record<DocStatusFileKey, string> {
  return (Object.keys(DOC_STATUS_FORM_KEYS) as DocStatusFileKey[]).reduce(
    (acc, key) => {
      acc[key] = "0";
      return acc;
    },
    {} as Record<DocStatusFileKey, string>,
  );
}

/** Laravel-style hidden fields + final submit flag for multipart profile APIs. */
export function appendProfileSubmitMeta(
  fd: FormData,
  finalSubmit: boolean,
  docStatuses: Record<DocStatusFileKey, string>,
): void {
  fd.append("finalsubmitval", finalSubmit ? "true" : "false");
  (Object.keys(DOC_STATUS_FORM_KEYS) as DocStatusFileKey[]).forEach((docKey) => {
    fd.append(DOC_STATUS_FORM_KEYS[docKey], docStatuses[docKey] ?? "0");
  });
}

export function extractDocCheckStatuses(
  source: Record<string, unknown>,
): Record<DocStatusFileKey, string> {
  const pick = (keys: string[]): string => {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
    return "0";
  };

  return {
    biodata: pick(["biodatadoccheck", "biodata_doc_check", "biodataDocCheck"]),
    cancelled_cheque: pick(["chequedoccheck", "cheque_doc_check", "chequeDocCheck"]),
    gst_declaration: pick(["gstdoccheck", "gst_doc_check", "gstDocCheck"]),
    vendor_registration_form: pick([
      "vrfoccheck",
      "vendorstamp_doc_check",
      "vendorDocCheck",
    ]),
    non_disclosure_agreement: pick(["ndcdoccheck", "ndc_doc_check", "ndcDocCheck"]),
    health_declaration: pick(["healthdoccheck", "health_doc_check", "healthDocCheck"]),
    pan_card: pick(["pandoccheck", "pan_doc_check", "panDocCheck"]),
  };
}

export function extractHasProfileImageFromServer(source: Record<string, unknown>): boolean {
  const url = pickStr(source, [
    "company_logo",
    "companyLogo",
    "profile_image_url",
    "profileImageUrl",
    "profileImage",
    "profile_image",
    "logo",
    "logoUrl",
  ]);
  if (url) {
    return true;
  }
  return Boolean(
    pickStr(source, [
      "company_logo_path",
      "profile_image_path",
      "profileImagePath",
      "logo_path",
    ]),
  );
}

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export function isNotOnlySpaces(value: string): boolean {
  return value.trim().length > 0;
}

export function hasNoDoubleSpace(value: string): boolean {
  return !/\s{2,}/.test(value);
}

export function isLettersAndSpacesOnly(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return /^[a-zA-Z\s]+$/.test(trimmed);
}

/** Letters, numbers, spaces (matches Laravel branch_name style). */
export function isBranchNamePattern(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return /^[a-zA-Z0-9\s]+$/.test(trimmed);
}

export function isQualificationCertificationPattern(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (!/^[a-zA-Z0-9\s,./()&+-]+$/.test(trimmed)) {
    return false;
  }
  return /[a-zA-Z]/.test(trimmed);
}

const EDUCATIONAL_QUALIFICATION_KEYWORDS = [
  "bachelor",
  "master",
  "degree",
  "diploma",
  "phd",
  "doctorate",
  "b.tech",
  "m.tech",
  "btech",
  "mtech",
  "mba",
  "bsc",
  "msc",
  "bcom",
  "mcom",
  "ba",
  "ma",
  "certification",
  "graduate",
  "post graduate",
];

const SPECIALIZATION_KEYWORDS = [
  "environment",
  "sustainability",
  "esg",
  "energy",
  "waste",
  "water",
  "carbon",
  "climate",
  "audit",
  "compliance",
  "safety",
  "ems",
  "hse",
];

export function hasEducationalQualificationKeyword(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return EDUCATIONAL_QUALIFICATION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function isAreaSpecializationPattern(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (!/^[a-zA-Z\s,./&+-]+$/.test(trimmed)) {
    return false;
  }
  return /[a-zA-Z]/.test(trimmed);
}

export function hasSpecializationKeyword(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return SPECIALIZATION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** Letters and numbers only, no spaces (account / IFSC style). */
export function isAlphanumericNoSpace(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return /^[a-zA-Z0-9]+$/.test(trimmed);
}

export function isDigitsOnly(value: string): boolean {
  return /^\d+$/.test(value);
}

export function isIndianMobile(value: string): boolean {
  return INDIAN_MOBILE.test(value);
}

export function isPincodeDigits(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isGstNumberPattern(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return trimmed.length <= 15 && /^[a-zA-Z0-9]+$/.test(trimmed);
}

const DOC_ACCEPT = /\.(pdf|jpe?g|png)$/i;
const DOC_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);
const PROFILE_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function isAllowedProfileImageFile(file: File): boolean {
  const hasValidExt = /\.(jpe?g|png)$/i.test(file.name);
  const mime = file.type.trim().toLowerCase();
  const hasValidMime = !mime || PROFILE_IMAGE_MIME_TYPES.has(mime);
  return hasValidExt && hasValidMime;
}

export function isAllowedDocumentFile(file: File): boolean {
  const hasValidExt = DOC_ACCEPT.test(file.name);
  const mime = file.type.trim().toLowerCase();
  const hasValidMime = !mime || DOC_MIME_TYPES.has(mime);
  return hasValidExt && hasValidMime;
}

export function getDocumentFileValidationError(file: File): string {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "File size must be 10MB or less.";
  }
  if (!isAllowedDocumentFile(file)) {
    return "Upload a valid document (PDF/JPG/JPEG/PNG).";
  }
  return "";
}

export type ProfileValidationContext = Readonly<{
  finalSubmit: boolean;
  hasServerProfileImage: boolean;
  docStatuses: Record<DocStatusFileKey, string>;
}>;

export type ProfileFieldErrors = Partial<Record<string, string>>;

function setErr(errors: ProfileFieldErrors, key: string, message: string | null | undefined) {
  if (message) {
    errors[key] = message;
  }
}

/**
 * Mirrors Laravel `profile.blade.php` + `submitprofile()` rules as closely as practical.
 * - `finalSubmit === false`: draft save — core identity + industry category + per-field sanity when filled.
 * - `finalSubmit === true`: final submit — adds required-on-final fields + conditional documents when doc status is "2".
 */
export function validateAssessorProfile(
  values: AssessorProfileFormValues,
  files: Partial<Record<AssessorProfileFileKey, File | null>>,
  context: ProfileValidationContext,
): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  const { finalSubmit, hasServerProfileImage, docStatuses } = context;

  const name = values.name;
  if (!name.trim()) {
    setErr(errors, "name", "Name is required.");
  } else {
    if (!isNotOnlySpaces(name)) {
      setErr(errors, "name", "Name cannot be only spaces.");
    } else if (!hasNoDoubleSpace(name)) {
      setErr(errors, "name", "Name cannot contain consecutive spaces.");
    } else if (name.trim().length < 3) {
      setErr(errors, "name", "Name must be at least 3 characters.");
    } else if (name.trim().length > 50) {
      setErr(errors, "name", "Name must be at most 50 characters.");
    }
  }

  const email = values.email.trim();
  if (!email) {
    setErr(errors, "email", "Email is required.");
  } else if (!isValidEmailFormat(email)) {
    setErr(errors, "email", "Please enter a valid email format.");
  }

  const mobile = values.mobile.trim();
  if (!mobile) {
    setErr(errors, "mobile", "Mobile number is required.");
  } else if (!isDigitsOnly(mobile)) {
    setErr(errors, "mobile", "Mobile must contain digits only.");
  } else if (mobile.length !== 10) {
    setErr(errors, "mobile", "Mobile must be exactly 10 digits.");
  } else if (!isIndianMobile(mobile)) {
    setErr(errors, "mobile", "Enter a valid 10-digit mobile number starting with 6–9.");
  }

  if (!values.industryCategory.trim()) {
    setErr(errors, "industryCategory", "Industry category is required.");
  }

  const alt = values.alternateMobile.trim();
  if (alt) {
    if (!isDigitsOnly(alt)) {
      setErr(errors, "alternateMobile", "Alternate mobile must contain digits only.");
    } else if (alt.length !== 10) {
      setErr(errors, "alternateMobile", "Alternate mobile must be exactly 10 digits.");
    } else if (!isIndianMobile(alt)) {
      setErr(errors, "alternateMobile", "Enter a valid 10-digit mobile number starting with 6–9.");
    }
  }

  if (finalSubmit) {
    if (!hasServerProfileImage && !files.profile_image) {
      setErr(errors, "profile_image", "Profile image is required (JPEG/PNG).");
    }

    const requireText = (key: keyof AssessorProfileFormValues, label: string, value: string) => {
      if (!value.trim()) {
        setErr(errors, key as string, `${label} is required.`);
      }
    };

    requireText("state", "State", values.state);
    requireText("addressLine1", "Address line 1", values.addressLine1);
    requireText("city", "City", values.city);
    requireText("pincode", "Pincode", values.pincode);
    requireText(
      "pancardNumber",
      "No. of years working in environmental sustainability facilitation services",
      values.pancardNumber,
    );
    requireText(
      "enrollmentDate",
      "Total no. of years of professional experience",
      values.enrollmentDate,
    );
    requireText(
      "leadAssessor",
      "Additional professional qualification/certifications",
      values.leadAssessor,
    );
    requireText("assessorGrade", "Educational qualification", values.assessorGrade);
    requireText("gstNumber", "Areas of specialization", values.gstNumber);
    if (!values.declarationAccepted) {
      setErr(errors, "declarationAccepted", "Please accept the declaration consent.");
    }

    const a1 = values.addressLine1;
    if (a1.trim()) {
      if (!hasNoDoubleSpace(a1)) {
        setErr(errors, "addressLine1", "Address line 1 cannot contain consecutive spaces.");
      } else if (a1.trim().length < 3) {
        setErr(errors, "addressLine1", "Address line 1 must be at least 3 characters.");
      }
    }

    const a2 = values.addressLine2;
    if (a2.trim()) {
      if (!hasNoDoubleSpace(a2)) {
        setErr(errors, "addressLine2", "Address line 2 cannot contain consecutive spaces.");
      } else if (a2.trim().length < 3) {
        setErr(errors, "addressLine2", "Address line 2 must be at least 3 characters.");
      }
    }

    const city = values.city;
    if (city.trim()) {
      if (!hasNoDoubleSpace(city)) {
        setErr(errors, "city", "City cannot contain consecutive spaces.");
      } else if (city.trim().length < 3) {
        setErr(errors, "city", "City must be at least 3 characters.");
      } else if (!isLettersAndSpacesOnly(city)) {
        setErr(errors, "city", "City may contain letters and spaces only.");
      }
    }

    if (values.pincode.trim() && !isPincodeDigits(values.pincode)) {
      setErr(errors, "pincode", "Pincode must be exactly 6 digits.");
    }

    if (values.pancardNumber.trim()) {
      const numericYears = Number(values.pancardNumber.trim());
      if (Number.isNaN(numericYears) || numericYears < 0 || numericYears > 99) {
        setErr(errors, "pancardNumber", "Enter valid years between 0 and 99.");
      }
    }

    if (values.enrollmentDate.trim()) {
      const numericYears = Number(values.enrollmentDate.trim());
      if (Number.isNaN(numericYears) || numericYears < 0 || numericYears > 99) {
        setErr(errors, "enrollmentDate", "Enter valid years between 0 and 99.");
      }
    }

    const qualification = values.leadAssessor.trim();
    if (qualification) {
      if (!isQualificationCertificationPattern(qualification)) {
        setErr(
          errors,
          "leadAssessor",
          "Enter valid qualification/certification details (letters, numbers and , . / ( ) & + - only).",
        );
      } else if (qualification.length < 3 || qualification.length > 120) {
        setErr(errors, "leadAssessor", "Qualification/certification must be 3 to 120 characters.");
      }
    }

    const educationalQualification = values.assessorGrade.trim();
    if (educationalQualification) {
      if (!isQualificationCertificationPattern(educationalQualification)) {
        setErr(
          errors,
          "assessorGrade",
          "Enter valid educational qualification (letters, numbers and , . / ( ) & + - only).",
        );
      } else if (educationalQualification.length < 2 || educationalQualification.length > 80) {
        setErr(errors, "assessorGrade", "Educational qualification must be 2 to 80 characters.");
      } else if (!hasEducationalQualificationKeyword(educationalQualification)) {
        setErr(errors, "assessorGrade", "Enter a valid educational qualification.");
      }
    }

    const specialization = values.gstNumber.trim();
    if (specialization) {
      if (!isAreaSpecializationPattern(specialization)) {
        setErr(
          errors,
          "gstNumber",
          "Enter valid area(s) of specialization (letters and , . / & + - only).",
        );
      } else if (specialization.length < 2 || specialization.length > 120) {
        setErr(errors, "gstNumber", "Area(s) of specialization must be 2 to 120 characters.");
      } else if (!hasSpecializationKeyword(specialization)) {
        setErr(errors, "gstNumber", "Enter a valid area of specialization.");
      }
    }

    if (values.companyWebsiteDetails.trim() && !isValidHttpUrl(values.companyWebsiteDetails)) {
      setErr(errors, "companyWebsiteDetails", "Company website details must be a valid URL (http/https).");
    }
    if (values.linkedinProfile.trim() && !isValidHttpUrl(values.linkedinProfile)) {
      setErr(errors, "linkedinProfile", "LinkedIn Profile must be a valid URL (http/https).");
    }

    const REQUIRED_DOCS: DocStatusFileKey[] = [
      "vendor_registration_form",
      "biodata",
      "non_disclosure_agreement",
      "health_declaration",
    ];

    (Object.keys(docStatuses) as DocStatusFileKey[]).forEach((docKey) => {
      const status = docStatuses[docKey] ?? "0";
      const hasServerFile = status !== "0";
      const file = files[docKey];
      const isReuploadRequested = status === "2";
      const isRequired = REQUIRED_DOCS.includes(docKey) || isReuploadRequested;

      if (isReuploadRequested && !file) {
        setErr(errors, docKey, "This document is required.");
        return;
      }

      if (isRequired && !hasServerFile && !file) {
        setErr(errors, docKey, "This document is required.");
        return;
      }

      if (file) {
        const docError = getDocumentFileValidationError(file);
        if (docError) {
          setErr(errors, docKey, docError);
        }
      }
    });

    (Object.keys(files) as AssessorProfileFileKey[]).forEach((key) => {
      const file = files[key];
      if (!file) {
        return;
      }
      if (key === "profile_image") {
        if (!isAllowedProfileImageFile(file)) {
          setErr(errors, "profile_image", "Profile image must be JPEG or PNG.");
        }
      } else {
        const docError = getDocumentFileValidationError(file);
        if (docError) {
          setErr(errors, key, docError);
        }
      }
    });
  } else {
    if (files.profile_image && !isAllowedProfileImageFile(files.profile_image)) {
      setErr(errors, "profile_image", "Profile image must be JPEG or PNG.");
    }
    (Object.keys(files) as AssessorProfileFileKey[]).forEach((key) => {
      const file = files[key];
      if (!file) {
        return;
      }
      if (key === "profile_image") {
        if (!isAllowedProfileImageFile(file)) {
          setErr(errors, "profile_image", "Profile image must be JPEG or PNG.");
        }
      } else {
        const docError = getDocumentFileValidationError(file);
        if (docError) {
          setErr(errors, key, docError);
        }
      }
    });

    const draftOptionalAddr = (field: keyof AssessorProfileFormValues, raw: string, label: string) => {
      const t = raw.trim();
      if (!t) {
        return;
      }
      if (!isNotOnlySpaces(raw)) {
        setErr(errors, field as string, `${label} cannot be only spaces.`);
      } else if (!hasNoDoubleSpace(raw)) {
        setErr(errors, field as string, `${label} cannot contain consecutive spaces.`);
      } else if (t.length < 3) {
        setErr(errors, field as string, `${label} must be at least 3 characters.`);
      }
    };

    draftOptionalAddr("addressLine1", values.addressLine1, "Address line 1");
    draftOptionalAddr("addressLine2", values.addressLine2, "Address line 2");

    const cityDraft = values.city.trim();
    if (cityDraft) {
      if (!hasNoDoubleSpace(values.city)) {
        setErr(errors, "city", "City cannot contain consecutive spaces.");
      } else if (cityDraft.length < 3) {
        setErr(errors, "city", "City must be at least 3 characters.");
      } else if (!isLettersAndSpacesOnly(values.city)) {
        setErr(errors, "city", "City may contain letters and spaces only.");
      }
    }

    if (values.pincode.trim() && !isPincodeDigits(values.pincode)) {
      setErr(errors, "pincode", "Pincode must be exactly 6 digits.");
    }

    const yearsDraft = values.pancardNumber.trim();
    if (yearsDraft) {
      const numericYears = Number(yearsDraft);
      if (Number.isNaN(numericYears) || numericYears < 0 || numericYears > 99) {
        setErr(errors, "pancardNumber", "Enter valid years between 0 and 99.");
      }
    }

    const totalYearsDraft = values.enrollmentDate.trim();
    if (totalYearsDraft) {
      const numericYears = Number(totalYearsDraft);
      if (Number.isNaN(numericYears) || numericYears < 0 || numericYears > 99) {
        setErr(errors, "enrollmentDate", "Enter valid years between 0 and 99.");
      }
    }

    const qualificationDraft = values.leadAssessor.trim();
    if (qualificationDraft) {
      if (!isQualificationCertificationPattern(qualificationDraft)) {
        setErr(
          errors,
          "leadAssessor",
          "Enter valid qualification/certification details (letters, numbers and , . / ( ) & + - only).",
        );
      } else if (qualificationDraft.length < 3 || qualificationDraft.length > 120) {
        setErr(errors, "leadAssessor", "Qualification/certification must be 3 to 120 characters.");
      }
    }

    const educationalQualificationDraft = values.assessorGrade.trim();
    if (educationalQualificationDraft) {
      if (!isQualificationCertificationPattern(educationalQualificationDraft)) {
        setErr(
          errors,
          "assessorGrade",
          "Enter valid educational qualification (letters, numbers and , . / ( ) & + - only).",
        );
      } else if (educationalQualificationDraft.length < 2 || educationalQualificationDraft.length > 80) {
        setErr(errors, "assessorGrade", "Educational qualification must be 2 to 80 characters.");
      } else if (!hasEducationalQualificationKeyword(educationalQualificationDraft)) {
        setErr(errors, "assessorGrade", "Enter a valid educational qualification.");
      }
    }

    const specializationDraft = values.gstNumber.trim();
    if (specializationDraft) {
      if (!isAreaSpecializationPattern(specializationDraft)) {
        setErr(
          errors,
          "gstNumber",
          "Enter valid area(s) of specialization (letters and , . / & + - only).",
        );
      } else if (specializationDraft.length < 2 || specializationDraft.length > 120) {
        setErr(errors, "gstNumber", "Area(s) of specialization must be 2 to 120 characters.");
      } else if (!hasSpecializationKeyword(specializationDraft)) {
        setErr(errors, "gstNumber", "Enter a valid area of specialization.");
      }
    }

    if (values.companyWebsiteDetails.trim() && !isValidHttpUrl(values.companyWebsiteDetails)) {
      setErr(errors, "companyWebsiteDetails", "Company website details must be a valid URL (http/https).");
    }
    if (values.linkedinProfile.trim() && !isValidHttpUrl(values.linkedinProfile)) {
      setErr(errors, "linkedinProfile", "LinkedIn Profile must be a valid URL (http/https).");
    }

    // No extra validations for removed emergency/bank sections.
  }

  return errors;
}
