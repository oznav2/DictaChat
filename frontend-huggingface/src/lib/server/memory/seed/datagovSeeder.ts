/**
 * DataGov Seeder - Seeds memory system with Israeli government data categories
 *
 * Pre-populates the system tier with DataGov category information so the model
 * can answer questions about available government data and route queries correctly.
 */

import { Database } from "$lib/server/database";
import { logger } from "$lib/server/logger";
import { config } from "$lib/server/config";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { v4 as uuid } from "uuid";

interface DataGovCategory {
	category: string;
	categoryEn: string;
	datasets: string[];
	capabilities: string[];
	exampleQueries: string[];
}

/**
 * DataGov categories from enterprise_expansions.py
 */
const DATAGOV_CATEGORIES: DataGovCategory[] = [
	{
		category: "תחבורה",
		categoryEn: "Transportation",
		datasets: ["רכבים", "רישיונות", "תאונות", "תחבורה ציבורית"],
		capabilities: ["vehicle_lookup", "license_status", "accident_stats"],
		exampleQueries: ["כמה רכבים מסוג טויוטה?", "סטטיסטיקת תאונות דרכים", "בדיקת רישיון נהיגה"],
	},
	{
		category: "בריאות",
		categoryEn: "Health",
		datasets: ["בתי חולים", "קופות חולים", "תרופות", "מדדי בריאות"],
		capabilities: ["hospital_search", "medication_lookup", "health_stats"],
		exampleQueries: ["בתי חולים בירושלים", "מידע על תרופה", "סטטיסטיקת תחלואה"],
	},
	{
		category: "חינוך",
		categoryEn: "Education",
		datasets: ["בתי ספר", "אוניברסיטאות", "מכללות", "גני ילדים"],
		capabilities: ["school_search", "education_stats"],
		exampleQueries: ["בתי ספר בתל אביב", "דירוג אוניברסיטאות"],
	},
	{
		category: "כלכלה",
		categoryEn: "Economy",
		datasets: ["תקציב המדינה", "יבוא", "יצוא", "אינפלציה", "שכר"],
		capabilities: ["budget_lookup", "trade_stats", "economic_indicators"],
		exampleQueries: ["תקציב משרד הביטחון", "נתוני יצוא", "שכר ממוצע במשק"],
	},
	{
		category: "תעסוקה",
		categoryEn: "Employment",
		datasets: ["אבטלה", "משרות פנויות", "שכר ענפי"],
		capabilities: ["unemployment_stats", "job_search"],
		exampleQueries: ["שיעור אבטלה", "משרות בהייטק"],
	},
	{
		category: "סביבה",
		categoryEn: "Environment",
		datasets: ["זיהום אוויר", "מיחזור", "שמורות טבע"],
		capabilities: ["pollution_data", "environmental_stats"],
		exampleQueries: ["איכות אוויר בחיפה", "נתוני מיחזור"],
	},
	{
		category: "ביטחון",
		categoryEn: "Security",
		datasets: ["פשיעה", "משטרה", "בטיחות"],
		capabilities: ["crime_stats", "safety_data"],
		exampleQueries: ["סטטיסטיקת פשיעה", "תחנות משטרה"],
	},
	{
		category: "דיור",
		categoryEn: "Housing",
		datasets: ["מחירי דירות", "שכירות", "בנייה"],
		capabilities: ["housing_prices", "real_estate_stats"],
		exampleQueries: ["מחירי דירות בתל אביב", "היתרי בנייה"],
	},
	{
		category: "תשתיות",
		categoryEn: "Infrastructure",
		datasets: ["חשמל", "מים", "ביוב", "כבישים"],
		capabilities: ["infrastructure_data"],
		exampleQueries: ["צריכת חשמל", "פרויקטי כבישים"],
	},
	{
		category: "רווחה",
		categoryEn: "Welfare",
		datasets: ["קצבאות", "סיוע סוציאלי", "דיור ציבורי"],
		capabilities: ["welfare_stats", "benefits_lookup"],
		exampleQueries: ["קצבת ילדים", "סיוע בדיור"],
	},
];

/**
 * Seeds DataGov category information into the system memory tier
 */
export async function seedDataGovCategories(): Promise<void> {
	try {
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);
		const collection = db.collection("memory_items");

		let seededCount = 0;

		for (const cat of DATAGOV_CATEGORIES) {
			const memoryId = `system_datagov_${cat.categoryEn.toLowerCase().replace(/\s/g, "_")}`;

			await collection.updateOne(
				{
					memory_id: memoryId,
					user_id: ADMIN_USER_ID,
				},
				{
					$set: {
						memory_id: memoryId,
						user_id: ADMIN_USER_ID,
						org_id: null,
						tier: "system",
						status: "active",
						text: formatDataGovCategory(cat),
						summary: `DataGov: ${cat.category} (${cat.categoryEn})`,
						tags: [
							"datagov",
							"system_knowledge",
							cat.category,
							cat.categoryEn,
							...cat.capabilities,
						],
						entities: [cat.category, cat.categoryEn, ...cat.datasets],
						always_inject: false,
						source: {
							type: "system_seed",
							tool_name: "datagov",
							conversation_id: null,
							message_id: null,
							doc_id: null,
							chunk_id: null,
						},
						quality: {
							importance: 0.85,
							confidence: 1.0,
							mentioned_count: 0,
							quality_score: 1.0,
						},
						stats: {
							uses: 0,
							last_used_at: null,
							worked_count: 0,
							failed_count: 0,
							partial_count: 0,
							unknown_count: 0,
							success_rate: 1.0,
							wilson_score: 0.5,
						},
						personality: {
							source_personality_id: null,
							source_personality_name: null,
						},
						// MongoDB text indexes don't support Hebrew - use "none" to disable language-specific stemming
						language: "none",
						translation_ref_id: null,
						updated_at: new Date(),
					},
					$setOnInsert: {
						_id: uuid(),
						created_at: new Date(),
						archived_at: null,
						expires_at: null,
						embedding: null,
						versioning: {
							current_version: 1,
							supersedes_memory_id: null,
						},
					},
				},
				{ upsert: true }
			);

			seededCount++;
		}

		logger.info({ categoryCount: seededCount }, "[Seeder] DataGov categories seeded");
	} catch (err) {
		logger.error({ err }, "[Seeder] Failed to seed DataGov categories");
	}
}

function formatDataGovCategory(cat: DataGovCategory): string {
	return `קטגוריה: ${cat.category} (${cat.categoryEn})
מאגרים זמינים: ${cat.datasets.join(", ")}
יכולות: ${cat.capabilities.join(", ")}

שאילתות לדוגמה:
${cat.exampleQueries.map((q) => `  - ${q}`).join("\n")}

Use DataGov tools when the user asks about Israeli government data related to: ${cat.category}, ${cat.categoryEn}, ${cat.datasets.join(", ")}.`;
}
