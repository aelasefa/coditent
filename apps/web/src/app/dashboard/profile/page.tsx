"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { LogoutButton } from "@/components/logout-button";
import { getProfile, updateProfile } from "@/lib/api";
import styles from "./profile-builder.module.css";

const urlField = z.union([z.literal(""), z.string().url()]);

const profileSchema = z.object({
  headline: z.string().max(120),
  bio: z.string().max(500),
  skills: z.string().max(500),
  years_of_experience: z
    .string()
    .regex(/^\d*$/)
    .refine((value) => value === "" || Number(value) <= 40),
  city: z.string().max(100),
  phone: z.string().max(30),
  field_of_study: z.string().max(120),
  university: z.string().max(160),
  study_level: z.enum(["", "BAC", "LICENCE", "MASTER", "DOCTORAT"]),
  linkedin_url: urlField,
  portfolio_url: urlField,
});

type ProfileValues = z.infer<typeof profileSchema>;

const checklistItems = [
  "Profile photo",
  "Professional headline",
  "Bio summary",
  "Key skills",
  "Years of experience",
  "Field of study",
  "Study level",
  "City",
  "Phone number",
  "LinkedIn URL",
  "Portfolio URL",
];

const completionKeys = [
  "headline",
  "bio",
  "skills",
  "years_of_experience",
  "field_of_study",
  "study_level",
  "city",
  "phone",
  "linkedin_url",
  "portfolio_url",
] as const;

function getSeniorityLabel(years: number): string {
  if (years === 0) return "Entry level";
  if (years <= 2) return "Junior";
  if (years <= 5) return "Mid-level";
  if (years <= 10) return "Senior";
  return "Expert / Lead";
}

function getInitials(fullName: string | null | undefined): string {
  if (!fullName) return "U";
  const parts = fullName.split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}

export default function ProfileBuilderPage() {
  const queryClient = useQueryClient();
  const skillInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [displayedPercentage, setDisplayedPercentage] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [aiLoading, setAiLoading] = useState<"headline" | "bio" | null>(null);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      headline: "",
      bio: "",
      skills: "",
      years_of_experience: "",
      city: "",
      phone: "",
      field_of_study: "",
      university: "",
      study_level: "",
      linkedin_url: "",
      portfolio_url: "",
    },
  });

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  useEffect(() => {
    if (!profileQuery.data) return;

    form.reset({
      headline: profileQuery.data.headline ?? "",
      bio: profileQuery.data.bio ?? "",
      skills: profileQuery.data.skills ?? "",
      years_of_experience:
        profileQuery.data.years_of_experience !== null &&
        profileQuery.data.years_of_experience !== undefined
          ? String(profileQuery.data.years_of_experience)
          : "",
      city: profileQuery.data.city ?? "",
      phone: profileQuery.data.phone ?? "",
      field_of_study: profileQuery.data.field_of_study ?? "",
      university: profileQuery.data.university ?? "",
      study_level: profileQuery.data.study_level ?? "",
      linkedin_url: profileQuery.data.linkedin_url ?? "",
      portfolio_url: profileQuery.data.portfolio_url ?? "",
    });

    if (profileQuery.data.skills) {
      setSkills(profileQuery.data.skills.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }, [profileQuery.data, form]);

  const watchedValues = form.watch(completionKeys);

  const completedCount = useMemo(() => {
    return watchedValues.filter((value) => typeof value === "string" && value.trim().length > 0).length;
  }, [watchedValues]);

  const completionPercent = useMemo(() => {
    return Math.round((completedCount / 10) * 100);
  }, [completedCount]);

  useEffect(() => {
    if (displayedPercentage === completionPercent) return;

    const start = displayedPercentage;
    const diff = completionPercent - start;
    const duration = 600;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setDisplayedPercentage(Math.round(start + diff * progress));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [completionPercent, displayedPercentage]);

  const checkedItems = useMemo(() => {
    return watchedValues.map((value) => typeof value === "string" && value.trim().length > 0);
  }, [watchedValues]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAddSkill = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
      e.preventDefault();
      const skill = input.value.trim().replace(/,$/, "");
      if (skill && !skills.includes(skill) && skills.length < 20) {
        const newSkills = [...skills, skill];
        setSkills(newSkills);
        form.setValue("skills", newSkills.join(", "));
        input.value = "";
      }
    }
  };

  const handleRemoveSkill = (skill: string) => {
    const newSkills = skills.filter((s) => s !== skill);
    setSkills(newSkills);
    form.setValue("skills", newSkills.join(", "));
  };

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 1500);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
  });

  const handleGenerateHeadline = async () => {
    if (skills.length === 0) return;
    setAiLoading("headline");
    try {
      const res = await fetch("/api/ai/generate-headline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills,
          fieldOfStudy: form.getValues("field_of_study"),
        }),
      });
      const data = await res.json();
      form.setValue("headline", data.headline);
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(null);
    }
  };

  const handleGenerateBio = async () => {
    if (skills.length === 0) return;
    setAiLoading("bio");
    try {
      const res = await fetch("/api/ai/generate-bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills,
          fieldOfStudy: form.getValues("field_of_study"),
          headline: form.getValues("headline"),
        }),
      });
      const data = await res.json();
      form.setValue("bio", data.bio);
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(null);
    }
  };

  const handleSave = form.handleSubmit(async (values) => {
    const years = values.years_of_experience.trim();
    updateMutation.mutate({
      headline: values.headline.trim() || null,
      bio: values.bio.trim() || null,
      skills: skills.length > 0 ? skills.join(", ") : null,
      years_of_experience: years ? Number(years) : null,
      city: values.city.trim() || null,
      phone: values.phone.trim() || null,
      field_of_study: values.field_of_study.trim() || null,
      university: values.university.trim() || null,
      study_level: values.study_level || null,
      linkedin_url: values.linkedin_url.trim() || null,
      portfolio_url: values.portfolio_url.trim() || null,
    });
  });

  const bioValue = form.watch("bio");
  const bioChars = bioValue.length;
  const bioAtMax = bioChars >= 500;

  const stepperValue = form.watch("years_of_experience");
  const expValue = stepperValue ? Number(stepperValue) : 0;

  const linkedinUrl = form.watch("linkedin_url");
  const portfolioUrl = form.watch("portfolio_url");

  const isLinkedinValid =
    !linkedinUrl || linkedinUrl === "" || linkedinUrl.startsWith("http://") || linkedinUrl.startsWith("https://");
  const isPortfolioValid =
    !portfolioUrl || portfolioUrl === "" || portfolioUrl.startsWith("http://") || portfolioUrl.startsWith("https://");

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - displayedPercentage / 100);

  const lastUpdated = profileQuery.data?.updated_at
    ? new Date(profileQuery.data.updated_at).toLocaleDateString()
    : "Not updated";

  return (
    <div className={styles.builderShell}>
      {/* LEFT PANEL */}
      <aside className={styles.builderLeft}>
        <div className={styles.leftHeader}>
          <p className={styles.eyebrow}>CANDIDATE WORKSPACE</p>
          <h1 className={styles.title}>Profile builder</h1>
          <p className={styles.subtitle}>Build a recruiter-ready profile</p>

          <div className={styles.headerActions}>
            <Link href="/dashboard/recommendations" className={styles.actionBtn}>
              Recommendations
            </Link>
            <LogoutButton />
          </div>
        </div>

        <div className={styles.ringContainer}>
          <div className={styles.ringWrapper}>
            <svg className={styles.ringSvg} viewBox="0 0 100 100">
              <defs>
                <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7C3AED" />
                  <stop offset="100%" stopColor="#A855F7" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r={radius} stroke="rgba(124, 58, 237, 0.12)" strokeWidth="8" fill="none" />
              <circle
                cx="50"
                cy="50"
                r={radius}
                stroke="url(#ringGradient)"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.4, 0, 0.2, 1)" }}
              />
            </svg>

            <div className={styles.ringCenter}>
              <div className={styles.percentage}>{displayedPercentage}%</div>
              <div className={styles.completeLabel}>complete</div>
            </div>
          </div>

          <div className={styles.ringStats}>
            <p className={styles.ringStatLine}>{completedCount} / 10 fields filled</p>
            <p className={styles.ringStatLine}>Last updated: {lastUpdated}</p>
          </div>
        </div>

        <div className={styles.checklist}>
          <p className={styles.checklistLabel}>Profile checklist</p>
          {checklistItems.map((label, index) => (
            <div key={label} className={styles.checkItem}>
              <div className={`${styles.checkDot} ${checkedItems[index] ? styles.checkDotFilled : styles.checkDotEmpty}`}>
                {checkedItems[index] ? "✓" : index + 1}
              </div>
              <span className={`${styles.checkLabel} ${checkedItems[index] ? styles.checkLabelFilled : styles.checkLabelEmpty}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT PANEL */}
      <main className={styles.builderRight}>
        <form onSubmit={handleSave} className={styles.fieldGroup}>
          {/* SECTION 1: PROFILE PHOTO */}
          <section id="section-photo" className={`${styles.sectionCard} ${styles.sectionCardAnimate1}`}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Profile photo</h2>
              <p className={styles.sectionSubtitle}>Helps recruiters recognize you.</p>
              <hr className={styles.sectionSeparator} />
            </div>

            <div className={styles.uploadSection}>
              <div className={styles.avatarPreview}>
                {photoPreview ? (
                  <img src={photoPreview} alt="Avatar" className={styles.avatarImage} />
                ) : (
                  getInitials(form.getValues("headline") || "")
                )}
              </div>
              <label className={styles.uploadZone}>
                <div className={styles.uploadIcon}>📷</div>
                <div className={styles.uploadText}>Drop photo or click to upload</div>
                <div className={styles.uploadSubtext}>PNG, JPG up to 5MB</div>
                <input type="file" accept="image/*" onChange={handlePhotoChange} className={styles.fileInput} />
              </label>
            </div>
          </section>

          {/* SECTION 2: PROFESSIONAL SNAPSHOT */}
          <section id="section-snapshot" className={`${styles.sectionCard} ${styles.sectionCardAnimate2}`}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Professional snapshot</h2>
              <p className={styles.sectionSubtitle}>Give recruiters a fast view of your role, strengths, and impact.</p>
              <hr className={styles.sectionSeparator} />
            </div>

            <div className={styles.fieldGroup}>
              <div>
                <label className={styles.fieldLabel}>Headline</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Junior Data Analyst focused on retail insights"
                  {...form.register("headline")}
                />
                <button type="button" className={styles.aiBtn} onClick={handleGenerateHeadline} disabled={aiLoading === "headline"}>
                  {aiLoading === "headline" ? "⏳ Generating..." : "✦ Generate with AI"}
                </button>
              </div>

              <div>
                <label className={styles.fieldLabel}>Bio</label>
                <textarea
                  className={styles.textarea}
                  placeholder="Summarize your strengths, project context, and practical impact."
                  {...form.register("bio")}
                  disabled={bioAtMax}
                />
                <div className={`${styles.characterCounter} ${bioChars > 450 ? styles.characterCounterWarning : ""} ${bioAtMax ? styles.characterCounterError : ""}`}>
                  {bioChars} / 500
                </div>
                <button type="button" className={styles.aiBtn} onClick={handleGenerateBio} disabled={aiLoading === "bio"}>
                  {aiLoading === "bio" ? "⏳ Generating..." : "✦ Generate with AI"}
                </button>
              </div>
            </div>
          </section>

          {/* SECTION 3: KEY SKILLS */}
          <section id="section-skills" className={`${styles.sectionCard} ${styles.sectionCardAnimate3}`}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Key skills</h2>
              <p className={styles.sectionSubtitle}>Add skills one by one — these power your AI recommendations.</p>
              <hr className={styles.sectionSeparator} />
            </div>

            <div className={styles.skillsWrap} onClick={() => skillInputRef.current?.focus()}>
              {skills.map((skill) => (
                <div key={skill} className={styles.skillChip}>
                  {skill}
                  <button
                    type="button"
                    className={styles.skillRemoveBtn}
                    onClick={(e) => {
                      e.preventDefault();
                      handleRemoveSkill(skill);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <input
                ref={skillInputRef}
                type="text"
                className={styles.skillInput}
                placeholder={skills.length === 0 ? "Add a skill..." : ""}
                onKeyDown={handleAddSkill}
              />
            </div>
            {skills.length >= 20 && <div className={styles.skillsMax}>Maximum 20 skills reached</div>}
          </section>

          {/* SECTION 4: EXPERIENCE */}
          <section id="section-experience" className={`${styles.sectionCard} ${styles.sectionCardAnimate4}`}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Experience</h2>
              <p className={styles.sectionSubtitle}>Help recruiters calibrate your seniority.</p>
              <hr className={styles.sectionSeparator} />
            </div>

            <div className={styles.stepperWrap}>
              <button
                type="button"
                className={styles.stepperBtn}
                onClick={() => {
                  const val = expValue > 0 ? expValue - 1 : 0;
                  form.setValue("years_of_experience", String(val));
                }}
              >
                −
              </button>
              <div className={styles.stepperValue}>{expValue}</div>
              <button
                type="button"
                className={styles.stepperBtn}
                onClick={() => {
                  const val = expValue < 40 ? expValue + 1 : 40;
                  form.setValue("years_of_experience", String(val));
                }}
              >
                +
              </button>
            </div>
            <div className={styles.seniorityLabel}>{getSeniorityLabel(expValue)}</div>
          </section>

          {/* SECTION 5: EDUCATION */}
          <section id="section-education" className={`${styles.sectionCard} ${styles.sectionCardAnimate5}`}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Education</h2>
              <p className={styles.sectionSubtitle}>Add background details that improve recommendation quality.</p>
              <hr className={styles.sectionSeparator} />
            </div>

            <div className={styles.gridTwo}>
              <div>
                <label className={styles.fieldLabel}>Field of study</label>
                <input type="text" className={styles.input} placeholder="Computer Science" {...form.register("field_of_study")} />
              </div>

              <div>
                <label className={styles.fieldLabel}>University</label>
                <input type="text" className={styles.input} placeholder="ENSA Casablanca" {...form.register("university")} />
              </div>

              <div>
                <label className={styles.fieldLabel}>Study level</label>
                <select className={styles.selectTrigger} {...form.register("study_level")}>
                  <option value="">Select level</option>
                  <option value="BAC">BAC</option>
                  <option value="LICENCE">LICENCE</option>
                  <option value="MASTER">MASTER</option>
                  <option value="DOCTORAT">DOCTORAT</option>
                </select>
              </div>
            </div>
          </section>

          {/* SECTION 6: CONTACT AND LINKS */}
          <section id="section-contact" className={`${styles.sectionCard} ${styles.sectionCardAnimate6}`}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Contact and links</h2>
              <p className={styles.sectionSubtitle}>Help recruiters reach you and verify your online presence.</p>
              <hr className={styles.sectionSeparator} />
            </div>

            <div className={styles.gridTwo}>
              <div>
                <label className={styles.fieldLabel}>City</label>
                <input type="text" className={styles.input} placeholder="Rabat" {...form.register("city")} />
              </div>

              <div>
                <label className={styles.fieldLabel}>Phone</label>
                <input type="tel" className={styles.input} placeholder="+212 6 00 00 00 00" {...form.register("phone")} />
              </div>

              <div className={styles.urlValidation}>
                <label className={styles.fieldLabel}>LinkedIn URL</label>
                <input
                  type="text"
                  className={`${styles.input} ${!isLinkedinValid ? styles.inputInvalid : ""}`}
                  placeholder="https://www.linkedin.com/in/your-profile"
                  {...form.register("linkedin_url")}
                />
                {linkedinUrl && linkedinUrl !== "" && (
                  <div className={`${styles.urlValidationIcon} ${isLinkedinValid ? styles.urlValid : styles.urlInvalid}`}>
                    {isLinkedinValid ? "✓" : "✗"}
                  </div>
                )}
              </div>

              <div className={styles.urlValidation}>
                <label className={styles.fieldLabel}>Portfolio URL</label>
                <input
                  type="text"
                  className={`${styles.input} ${!isPortfolioValid ? styles.inputInvalid : ""}`}
                  placeholder="https://your-portfolio.com"
                  {...form.register("portfolio_url")}
                />
                {portfolioUrl && portfolioUrl !== "" && (
                  <div className={`${styles.urlValidationIcon} ${isPortfolioValid ? styles.urlValid : styles.urlInvalid}`}>
                    {isPortfolioValid ? "✓" : "✗"}
                  </div>
                )}
              </div>
            </div>
          </section>
        </form>
      </main>

      {/* FLOATING SAVE BUTTON */}
      <button
        onClick={handleSave}
        disabled={updateMutation.isPending}
        className={`${styles.saveBtn} ${saveStatus === "success" ? styles.saveBtnSuccess : ""} ${saveStatus === "error" ? styles.saveBtnError : ""} ${updateMutation.isPending ? styles.saveBtnLoading : ""}`}
      >
        {updateMutation.isPending ? "⏳ Saving..." : saveStatus === "success" ? "✓ Saved" : saveStatus === "error" ? "✗ Error" : "Save profile"}
      </button>
    </div>
  );
}
