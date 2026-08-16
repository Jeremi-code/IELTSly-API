import mongoose from "mongoose";
import dotenv from "dotenv";
import { Question } from "../models/question.model.js";
import {
  Essay,
  EssayStatus,
  EssayType,
  EssayMode,
} from "../models/essay.model.js";

dotenv.config();

async function run() {
  await mongoose.connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/ieltsly",
  );
  console.log("Connected to MongoDB");

  if (!mongoose.connection.db) {
    throw new Error("Database connection not established");
  }
  const users = await mongoose.connection.db
    .collection("user")
    .find({})
    .toArray();
  console.log(
    `Found ${users.length} users in database:`,
    users.map((u) => u.email),
  );

  if (users.length === 0) {
    console.error("No users found to seed essays for.");
    await mongoose.disconnect();
    return;
  }

  // Fetch genuine questions from database
  const task1Questions = await Question.find({ taskType: "task1" }).limit(10);
  const task2Questions = await Question.find({ taskType: "task2" }).limit(10);

  console.log(
    `Retrieved ${task1Questions.length} Task 1 questions and ${task2Questions.length} Task 2 questions.`,
  );

  if (task1Questions.length === 0 || task2Questions.length === 0) {
    console.error("Not enough questions in database.");
    await mongoose.disconnect();
    return;
  }

  const sampleEssaysDataset = [
    {
      qIndex: 0,
      type: EssayType.Task1,
      mode: EssayMode.Practice,
      wordCount: 174,
      durationSec: 1140, // 19 mins
      daysAgo: 14,
      criteria: { ta: 6.0, cc: 6.5, lr: 6.0, gra: 6.5 },
      overallBand: 6.5,
      feedback:
        "Good overview provided with reasonable selection of main trends. However, several specific figures in the body paragraphs lack clear comparative language.",
      tips: [
        "Include an explicit overall trend sentence highlighting the most striking contrast.",
        "Use accurate data-linking phrases like 'in stark contrast to' rather than simple conjunctions.",
      ],
      response:
        "The provided chart illustrates the patterns of household expenditure across five sectors between 1980 and 2010. Overall, it is evident that spending on food and clothing experienced a downward trajectory, whereas transport and housing captured an increasing proportion of family budgets.\n\nIn 1980, food constituted the largest segment at approximately 33%, followed by housing at 22%. Over the thirty-year span, food expenditure dropped steadily to 18% in 2010. Conversely, housing allocations grew significantly, reaching 31% by the end of the period.\n\nRegarding the remaining categories, transport costs saw a moderate rise from 15% to 23%. Clothing and entertainment remained comparatively minor, each accounting for under 12% in 2010.",
    },
    {
      qIndex: 0,
      type: EssayType.Task2,
      mode: EssayMode.Practice,
      wordCount: 288,
      durationSec: 2280, // 38 mins
      daysAgo: 12,
      criteria: { ta: 6.0, cc: 6.0, lr: 6.5, gra: 6.0 },
      overallBand: 6.0,
      feedback:
        "The essay addresses the prompt with clear examples, but body paragraph 2 drifts slightly off-topic. Grammatical structures could be more varied.",
      tips: [
        "Ensure each body paragraph begins with a strong, unambiguous topic sentence.",
        "Vary clause structures by incorporating conditional sentences and relative clauses.",
      ],
      response:
        "In modern society, technological automation is transforming the global workforce at an unprecedented speed. While some argue that artificial intelligence threatens human livelihoods, others maintain that it generates superior career opportunities. This essay will examine both perspectives before presenting my own conclusion.\n\nOn the one hand, automation inevitably displaces manual and repetitive roles. In industries such as manufacturing and customer support, machine learning algorithms can perform tasks with greater efficiency and fewer errors. Consequently, low-skilled workers face imminent job losses unless comprehensive retraining initiatives are implemented.\n\nOn the other hand, technological advancement fosters entirely new industries. The emergence of software engineering, data science, and digital marketing proves that technology creates high-value employment opportunities. Moreover, automating menial duties allows professionals to concentrate on creative problem-solving.\n\nIn conclusion, although automation creates temporary displacement, its long-term benefits in productivity and new job creation outweigh the negatives.",
    },
    {
      qIndex: 1,
      type: EssayType.Task1,
      mode: EssayMode.Exam,
      wordCount: 165,
      durationSec: 1200, // 20 mins
      daysAgo: 10,
      criteria: { ta: 7.0, cc: 6.5, lr: 7.0, gra: 6.5 },
      overallBand: 7.0,
      feedback:
        "Strong overview and well-organized data groupings. Lexical resource demonstrates good academic precision.",
      tips: [
        "Avoid repetitive use of 'increased' and 'decreased' by using noun phrases like 'saw an upward trend'.",
        "Check preposition accuracy after verbs of change (e.g. 'rose by 10%' vs 'rose to 50%').",
      ],
      response:
        "The graph provides information on electricity production from renewable and non-renewable sources in four European nations over a ten-year timeframe from 2005 to 2015.\n\nOverall, renewable energy generation increased across all surveyed countries, while reliance on fossil fuels exhibited a corresponding decline. Country A maintained the highest output of clean energy throughout the decade.\n\nIn 2005, renewable production in Country A stood at 40 terawatt-hours (TWh), subsequently climbing to a peak of 78 TWh by 2015. Country B followed a similar positive trajectory, doubling its clean energy from 25 TWh to 50 TWh over the same period.\n\nIn contrast, non-renewable generation in Countries C and D dropped considerably, falling by approximately 30% and 45% respectively.",
    },
    {
      qIndex: 1,
      type: EssayType.Task2,
      mode: EssayMode.Practice,
      wordCount: 310,
      durationSec: 2400, // 40 mins
      daysAgo: 8,
      criteria: { ta: 6.5, cc: 6.5, lr: 7.0, gra: 7.0 },
      overallBand: 7.0,
      feedback:
        "Clear and well-balanced argument. The vocabulary is rich with academic collocations such as 'foster environmental stewardship' and 'fiscal incentives'.",
      tips: [
        "Maintain tighter topic cohesion between paragraph 1 and paragraph 2.",
        "Ensure conclusions summarize arguments without introducing new unsupported claims.",
      ],
      response:
        "Environmental preservation has become one of the most critical challenges of the twenty-first century. Some individuals believe that governments should bear primary responsibility for green policies, whereas others argue that individual lifestyle modifications are paramount.\n\nGovernments possess legislative authority and financial resources that individuals lack. By enacting stringent regulations on industrial emissions and subsidizing renewable energy research, national authorities can accomplish large-scale reductions in carbon footprint. Furthermore, public transport infrastructure investments can systematically decrease automotive pollution in metropolitan areas.\n\nNevertheless, personal accountability remains indispensable. If citizens continue excessive consumption habits and disregard waste recycling protocols, governmental regulations will prove ineffective. Simple domestic adjustments, such as reducing single-use plastics and conserving electricity, aggregate into substantial environmental benefits.\n\nIn conclusion, combating environmental degradation requires an integrated approach where legislative governance and individual conscientiousness reinforce each other.",
    },
    {
      qIndex: 2,
      type: EssayType.Task1,
      mode: EssayMode.Practice,
      wordCount: 182,
      durationSec: 1080, // 18 mins
      daysAgo: 5,
      criteria: { ta: 7.5, cc: 7.5, lr: 7.0, gra: 7.5 },
      overallBand: 7.5,
      feedback:
        "Excellent overview and thorough reporting of key features. Transitions are smooth and natural with accurate passive structures.",
      tips: [
        "Maintain this high standard of grammatical complexity and error-free sentence construction.",
        "Ensure minor details do not crowd the main trend summaries.",
      ],
      response:
        "The diagram illustrates the sequential stages involved in the commercial production of recycled paper from domestic waste materials.\n\nOverall, the linear manufacturing process comprises six primary phases, commencing with waste collection and culminating in the rolling and packaging of finished paper products.\n\nInitially, discarded paper is collected from designated recycling bins and transported to a processing facility. Here, the raw material undergoes rigorous manual sorting to eliminate contaminants such as plastic and metal fragments. Following this, the sorted paper is placed into a mechanical hydrapulper where water and cleaning chemicals are added to create a fibrous pulp mixture.\n\nSubsequently, the pulp is filtered and subjected to de-inking using flotation chambers. In the final stages, the refined cellulose fibers are passed through heated rollers that extract residual moisture, pressing the material into uniform sheets ready for commercial distribution.",
    },
    {
      qIndex: 2,
      type: EssayType.Task2,
      mode: EssayMode.Exam,
      wordCount: 325,
      durationSec: 2340, // 39 mins
      daysAgo: 3,
      criteria: { ta: 7.5, cc: 7.0, lr: 7.5, gra: 7.5 },
      overallBand: 7.5,
      feedback:
        "Well-structured response with mature lexical items and sophisticated grammatical structures. Fully answers all components of the prompt.",
      tips: [
        "Integrate even more varied discourse markers within sentences to raise CC to 8.0.",
        "Ensure concise transitions between counterarguments.",
      ],
      response:
        "International tourism has expanded exponentially over recent decades, becoming a fundamental pillar of many national economies. Despite the undeniable economic prosperity it brings to host communities, concerns have been raised regarding cultural erosion and environmental degradation.\n\nFrom an economic standpoint, tourism acts as a powerful catalyst for regional development. Developing destinations benefit immensely from foreign currency inflows, hospitality job creation, and upgraded transport networks. Local artisans and service providers experience direct revenue growth, which frequently elevates living standards in previously impoverished regions.\n\nHowever, unrestricted tourist influxes can impose severe drawbacks. The commercialization of cultural heritage often leads to the superficial commodification of ancient traditions. Moreover, popular natural sanctuaries suffer from overcrowding, pollution, and biodiversity disruption caused by hotel construction.\n\nUltimately, while international tourism delivers indispensable fiscal advantages, destination authorities must enforce sustainable management frameworks to protect local ecology and cultural authenticity.",
    },
    {
      qIndex: 3,
      type: EssayType.Task2,
      mode: EssayMode.Practice,
      wordCount: 335,
      durationSec: 2200, // 36 mins
      daysAgo: 1,
      criteria: { ta: 8.0, cc: 7.5, lr: 8.0, gra: 7.5 },
      overallBand: 8.0,
      feedback:
        "Outstanding essay. The position is completely clear and nuanced throughout. Excellent collocations and grammatical precision.",
      tips: [
        "Continue employing sophisticated subordinate clauses and academic vocabulary.",
        "Keep paragraph length balanced across both central arguments.",
      ],
      response:
        "In the digital era, distance learning has emerged as a viable alternative to traditional classroom education. While some educators contend that physical university attendance is indispensable for holistic intellectual development, I believe that online academic platforms offer unparalleled flexibility and accessibility.\n\nProponents of traditional tertiary institutions emphasize the benefits of direct interpersonal interaction. On-campus education fosters spontaneous intellectual debates, collaborative research projects, and vital networking opportunities that are difficult to replicate in virtual settings. Additionally, campus environments provide structured schedules and access to specialized physical laboratory facilities.\n\nNevertheless, online learning democratizes higher education by eliminating geographical and economic barriers. Working professionals and students residing in remote regions can access world-class curricula from prestigious international universities without incurring prohibitive relocation or accommodation costs. Furthermore, self-paced digital modules empower students to tailor their study schedules around personal commitments.\n\nIn conclusion, although conventional universities provide valuable social immersion, the advantages of online education in terms of democratization and flexibility make it an equally robust educational paradigm.",
    },
  ];

  // Insert for every user so that all accounts see full data
  for (const user of users) {
    const userId = String(user._id);
    console.log(
      `\nSeeding evaluation history for user ${user.email} (${userId})...`,
    );

    // Remove existing essays for clean demo state
    await Essay.deleteMany({ user: userId });

    const createdEssays = [];

    for (let i = 0; i < sampleEssaysDataset.length; i++) {
      const item = sampleEssaysDataset[i];
      const qPool = item.type === "task1" ? task1Questions : task2Questions;
      const question = qPool[item.qIndex % qPool.length];

      const createdAt = new Date(
        Date.now() - item.daysAgo * 24 * 60 * 60 * 1000,
      );

      const essay = await Essay.create({
        user: userId,
        type: item.type,
        mode: item.mode,
        questionId: question._id,
        question: {
          text: question.text,
          category: question.category,
          imageUrl: question.imageUrl,
        },
        response: item.response,
        wordCount: item.wordCount,
        durationSec: item.durationSec,
        status: EssayStatus.Evaluated,
        evaluation: {
          overallBand: item.overallBand,
          criteria: item.criteria,
          feedback: item.feedback,
          tips: item.tips,
          evaluatedAt: createdAt,
        },
        createdAt: createdAt,
        updatedAt: createdAt,
      });

      createdEssays.push(essay);
    }

    // Now create 2 Reworks to demonstrate score improvements (+0.5 and +1.0)
    if (createdEssays.length >= 2) {
      // Rework 1: of essay 0 (Task 1: 6.5 -> 7.5)
      const orig1 = createdEssays[0];
      const rework1Date = new Date(
        orig1.createdAt.getTime() + 2 * 24 * 60 * 60 * 1000,
      );
      await Essay.create({
        user: userId,
        type: orig1.type,
        mode: EssayMode.Practice,
        questionId: orig1.questionId,
        question: orig1.question,
        response:
          orig1.response +
          "\n\nAdditionally, comparative analysis shows an indisputable correlation between these spending shifts.",
        wordCount: orig1.wordCount + 25,
        durationSec: 900,
        status: EssayStatus.Evaluated,
        reworkOf: orig1._id,
        evaluation: {
          overallBand: 7.5,
          criteria: { ta: 7.5, cc: 7.5, lr: 7.5, gra: 7.5 },
          feedback:
            "Great revision! The addition of precise contrastive phrases resolved the previous ambiguities.",
          tips: [
            "Excellent improvement in data linking and overview accuracy.",
          ],
          evaluatedAt: rework1Date,
        },
        createdAt: rework1Date,
        updatedAt: rework1Date,
      });

      // Rework 2: of essay 1 (Task 2: 6.0 -> 7.0)
      const orig2 = createdEssays[1];
      const rework2Date = new Date(
        orig2.createdAt.getTime() + 2 * 24 * 60 * 60 * 1000,
      );
      await Essay.create({
        user: userId,
        type: orig2.type,
        mode: EssayMode.Practice,
        questionId: orig2.questionId,
        question: orig2.question,
        response: orig2.response,
        wordCount: orig2.wordCount + 30,
        durationSec: 1500,
        status: EssayStatus.Evaluated,
        reworkOf: orig2._id,
        evaluation: {
          overallBand: 7.0,
          criteria: { ta: 7.0, cc: 7.0, lr: 7.0, gra: 7.0 },
          feedback:
            "Much stronger paragraph cohesion and improved topic sentence discipline.",
          tips: [
            "Keep utilizing clear discourse transitions throughout body paragraphs.",
          ],
          evaluatedAt: rework2Date,
        },
        createdAt: rework2Date,
        updatedAt: rework2Date,
      });
    }

    console.log(
      `Successfully created evaluation history & rework records for ${user.email}`,
    );
  }

  await mongoose.disconnect();
  console.log("\nDatabase seeding completed successfully!");
}

run().catch((err) => {
  console.error("Error seeding analytics data:", err);
  process.exit(1);
});
