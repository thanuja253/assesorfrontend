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

export function isGstNumberPattern(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return trimmed.length <= 15 && /^[a-zA-Z0-9]+$/.test(trimmed);
}

const DOC_ACCEPT = /\.(pdf|jpe?g|png)$/i;

export function isAllowedProfileImageFile(file: File): boolean {
  return /\.(jpe?g|png)$/i.test(file.name);
}

export function isAllowedDocumentFile(file: File): boolean {
  return DOC_ACCEPT.test(file.name);
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
    requireText("pancardNumber", "PAN card number", values.pancardNumber);
    requireText("enrollmentDate", "Enrollment date", values.enrollmentDate);
    requireText("leadAssessor", "Lead assessor", values.leadAssessor);
    requireText("assessorGrade", "Assessor grade", values.assessorGrade);

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

    const panRaw = values.pancardNumber.trim();
    const panCompact = panRaw.replaceAll(" ", "");
    if (panCompact) {
      if (panCompact.length !== 10) {
        setErr(errors, "pancardNumber", "PAN must be exactly 10 characters.");
      } else if (!/^[a-zA-Z0-9]+$/.test(panCompact)) {
        setErr(errors, "pancardNumber", "Please Enter a Valid PAN Card No");
      }
    }

    if (values.gstYes) {
      const gstn = values.gstNumber.trim();
      if (!gstn) {
        setErr(errors, "gstNumber", "GST number is required.");
      } else if (!isGstNumberPattern(gstn)) {
        setErr(errors, "gstNumber", "GST number must be alphanumeric and at most 15 characters.");
      }
    }

    requireText("emergencyContactName", "Emergency contact name", values.emergencyContactName);
    requireText("emergencyMobile", "Emergency contact mobile", values.emergencyMobile);
    requireText("emergencyAddressLine1", "Emergency address line 1", values.emergencyAddressLine1);
    requireText("emergencyCity", "Emergency city", values.emergencyCity);
    requireText("emergencyState", "Emergency state", values.emergencyState);
    requireText("emergencyPincode", "Emergency pincode", values.emergencyPincode);

    const emName = values.emergencyContactName;
    if (emName.trim()) {
      if (!isNotOnlySpaces(emName)) {
        setErr(errors, "emergencyContactName", "Emergency contact name cannot be only spaces.");
      } else if (!hasNoDoubleSpace(emName)) {
        setErr(errors, "emergencyContactName", "Emergency contact name cannot contain consecutive spaces.");
      } else if (emName.trim().length < 3 || emName.trim().length > 50) {
        setErr(errors, "emergencyContactName", "Emergency contact name must be 3–50 characters.");
      } else if (!isLettersAndSpacesOnly(emName)) {
        setErr(errors, "emergencyContactName", "Emergency contact name may contain letters and spaces only.");
      }
    }

    const emMobile = values.emergencyMobile.trim();
    if (emMobile) {
      if (!isDigitsOnly(emMobile) || emMobile.length !== 10 || !isIndianMobile(emMobile)) {
        setErr(errors, "emergencyMobile", "Enter a valid 10-digit emergency mobile starting with 6–9.");
      }
    }

    const emA1 = values.emergencyAddressLine1;
    if (emA1.trim()) {
      if (!hasNoDoubleSpace(emA1)) {
        setErr(errors, "emergencyAddressLine1", "Emergency address line 1 cannot contain consecutive spaces.");
      } else if (emA1.trim().length < 3) {
        setErr(errors, "emergencyAddressLine1", "Emergency address line 1 must be at least 3 characters.");
      }
    }

    const emA2 = values.emergencyAddressLine2;
    if (emA2.trim()) {
      if (!hasNoDoubleSpace(emA2)) {
        setErr(errors, "emergencyAddressLine2", "Emergency address line 2 cannot contain consecutive spaces.");
      } else if (emA2.trim().length < 3) {
        setErr(errors, "emergencyAddressLine2", "Emergency address line 2 must be at least 3 characters.");
      }
    }

    const emCity = values.emergencyCity;
    if (emCity.trim()) {
      if (!hasNoDoubleSpace(emCity)) {
        setErr(errors, "emergencyCity", "Emergency city cannot contain consecutive spaces.");
      } else if (emCity.trim().length < 3) {
        setErr(errors, "emergencyCity", "Emergency city must be at least 3 characters.");
      } else if (!isLettersAndSpacesOnly(emCity)) {
        setErr(errors, "emergencyCity", "Emergency city may contain letters and spaces only.");
      }
    }

    if (values.emergencyPincode.trim() && !isPincodeDigits(values.emergencyPincode)) {
      setErr(errors, "emergencyPincode", "Emergency pincode must be exactly 6 digits.");
    }

    requireText("bankName", "Bank name", values.bankName);
    requireText("ifscCode", "IFSC code", values.ifscCode);
    requireText("accountNumber", "Account number", values.accountNumber);

    const bank = values.bankName;
    if (bank.trim()) {
      if (!isNotOnlySpaces(bank) || !hasNoDoubleSpace(bank)) {
        setErr(errors, "bankName", "Bank name cannot be empty or have double spaces.");
      } else if (bank.trim().length < 3 || bank.trim().length > 50) {
        setErr(errors, "bankName", "Bank name must be 3–50 characters.");
      } else if (!isLettersAndSpacesOnly(bank)) {
        setErr(errors, "bankName", "Bank name may contain letters and spaces only.");
      }
    }

    const branch = values.branchName;
    if (branch.trim()) {
      if (!isNotOnlySpaces(branch) || !hasNoDoubleSpace(branch)) {
        setErr(errors, "branchName", "Branch name cannot be empty or have double spaces.");
      } else if (branch.trim().length < 3 || branch.trim().length > 50) {
        setErr(errors, "branchName", "Branch name must be 3–50 characters.");
      } else if (!isBranchNamePattern(branch)) {
        setErr(errors, "branchName", "Branch name may contain letters, numbers, and spaces only.");
      }
    }

    const ifsc = values.ifscCode.trim();
    if (ifsc) {
      if (!hasNoDoubleSpace(values.ifscCode) || !isNotOnlySpaces(values.ifscCode)) {
        setErr(errors, "ifscCode", "IFSC cannot be only spaces.");
      } else if (ifsc.length < 3 || ifsc.length > 50) {
        setErr(errors, "ifscCode", "IFSC must be 3–50 characters.");
      } else if (!isAlphanumericNoSpace(ifsc)) {
        setErr(errors, "ifscCode", "IFSC may contain letters and numbers only (no spaces).");
      }
    }

    const acc = values.accountNumber.trim();
    if (acc) {
      if (!hasNoDoubleSpace(values.accountNumber)) {
        setErr(errors, "accountNumber", "Account number cannot contain consecutive spaces.");
      } else if (acc.length < 10 || acc.length > 50) {
        setErr(errors, "accountNumber", "Account number must be 10–50 characters.");
      } else if (!isAlphanumericNoSpace(acc)) {
        setErr(errors, "accountNumber", "Account number may contain letters and numbers only.");
      }
    }

    const REQUIRED_DOCS: DocStatusFileKey[] = [
      "cancelled_cheque",
      "gst_declaration",
      "vendor_registration_form",
      "non_disclosure_agreement",
      "pan_card",
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

      if (file && !isAllowedDocumentFile(file)) {
        setErr(errors, docKey, "Allowed types: PDF, JPEG, JPG, PNG.");
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
      } else if (!isAllowedDocumentFile(file)) {
        setErr(errors, key, "Allowed types: PDF, JPEG, JPG, PNG.");
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
      } else if (!isAllowedDocumentFile(file)) {
        setErr(errors, key, "Allowed types: PDF, JPEG, JPG, PNG.");
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

    const panDraft = values.pancardNumber.replace(/\s+/g, "");
    if (panDraft && (!/^[a-zA-Z0-9]{10}$/.test(panDraft) || panDraft.length !== 10)) {
      setErr(errors, "pancardNumber", "PAN must be exactly 10 letters/numbers.");
    }

    if (values.gstYes) {
      const gstn = values.gstNumber.trim();
      if (gstn && !isGstNumberPattern(gstn)) {
        setErr(errors, "gstNumber", "GST number must be alphanumeric and at most 15 characters.");
      }
    }

    const emNameD = values.emergencyContactName;
    if (emNameD.trim()) {
      if (!isNotOnlySpaces(emNameD)) {
        setErr(errors, "emergencyContactName", "Emergency contact name cannot be only spaces.");
      } else if (!hasNoDoubleSpace(emNameD)) {
        setErr(errors, "emergencyContactName", "Emergency contact name cannot contain consecutive spaces.");
      } else if (emNameD.trim().length < 3 || emNameD.trim().length > 50) {
        setErr(errors, "emergencyContactName", "Emergency contact name must be 3–50 characters.");
      } else if (!isLettersAndSpacesOnly(emNameD)) {
        setErr(errors, "emergencyContactName", "Emergency contact name may contain letters and spaces only.");
      }
    }

    const emMobileD = values.emergencyMobile.trim();
    if (emMobileD) {
      if (!isDigitsOnly(emMobileD) || emMobileD.length !== 10 || !isIndianMobile(emMobileD)) {
        setErr(errors, "emergencyMobile", "Enter a valid 10-digit emergency mobile starting with 6–9.");
      }
    }

    draftOptionalAddr("emergencyAddressLine1", values.emergencyAddressLine1, "Emergency address line 1");
    draftOptionalAddr("emergencyAddressLine2", values.emergencyAddressLine2, "Emergency address line 2");

    const emCityD = values.emergencyCity.trim();
    if (emCityD) {
      if (!hasNoDoubleSpace(values.emergencyCity)) {
        setErr(errors, "emergencyCity", "Emergency city cannot contain consecutive spaces.");
      } else if (emCityD.length < 3) {
        setErr(errors, "emergencyCity", "Emergency city must be at least 3 characters.");
      } else if (!isLettersAndSpacesOnly(values.emergencyCity)) {
        setErr(errors, "emergencyCity", "Emergency city may contain letters and spaces only.");
      }
    }

    if (values.emergencyPincode.trim() && !isPincodeDigits(values.emergencyPincode)) {
      setErr(errors, "emergencyPincode", "Emergency pincode must be exactly 6 digits.");
    }

    const bankD = values.bankName;
    if (bankD.trim()) {
      if (!isNotOnlySpaces(bankD) || !hasNoDoubleSpace(bankD)) {
        setErr(errors, "bankName", "Bank name cannot be empty or have double spaces.");
      } else if (bankD.trim().length < 3 || bankD.trim().length > 50) {
        setErr(errors, "bankName", "Bank name must be 3–50 characters.");
      } else if (!isLettersAndSpacesOnly(bankD)) {
        setErr(errors, "bankName", "Bank name may contain letters and spaces only.");
      }
    }

    const branchD = values.branchName;
    if (branchD.trim()) {
      if (!isNotOnlySpaces(branchD) || !hasNoDoubleSpace(branchD)) {
        setErr(errors, "branchName", "Branch name cannot be empty or have double spaces.");
      } else if (branchD.trim().length < 3 || branchD.trim().length > 50) {
        setErr(errors, "branchName", "Branch name must be 3–50 characters.");
      } else if (!isBranchNamePattern(branchD)) {
        setErr(errors, "branchName", "Branch name may contain letters, numbers, and spaces only.");
      }
    }

    const ifscD = values.ifscCode.trim();
    if (ifscD) {
      if (!hasNoDoubleSpace(values.ifscCode) || !isNotOnlySpaces(values.ifscCode)) {
        setErr(errors, "ifscCode", "IFSC cannot be only spaces.");
      } else if (ifscD.length < 3 || ifscD.length > 50) {
        setErr(errors, "ifscCode", "IFSC must be 3–50 characters.");
      } else if (!isAlphanumericNoSpace(ifscD)) {
        setErr(errors, "ifscCode", "IFSC may contain letters and numbers only (no spaces).");
      }
    }

    const accD = values.accountNumber.trim();
    if (accD) {
      if (!hasNoDoubleSpace(values.accountNumber)) {
        setErr(errors, "accountNumber", "Account number cannot contain consecutive spaces.");
      } else if (accD.length < 10 || accD.length > 50) {
        setErr(errors, "accountNumber", "Account number must be 10–50 characters.");
      } else if (!isAlphanumericNoSpace(accD)) {
        setErr(errors, "accountNumber", "Account number may contain letters and numbers only.");
      }
    }
  }

  return errors;
}
