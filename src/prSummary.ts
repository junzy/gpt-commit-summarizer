import type { PayloadRepository } from "@actions/github/lib/interfaces";

import { octokit } from "./octokit";
import {
  MAX_OPEN_AI_QUERY_LENGTH,
  MAX_TOKENS,
  MODEL_NAME,
  openai,
  TEMPERATURE,
} from "./openAi";
import { SHARED_PROMPT } from "./sharedPrompt";


const OPEN_AI_PROMPT = `${SHARED_PROMPT}
The following is a git diff of a list of files.
Please summarize the diff and come up with a name for the pull request along with its description
Do it in the following way:
Write \`Pull Request Name:\` and then write a name for the pull request
Write \`Description:\` and then write a bullet pointed summary of the changes as the description
Every bullet point should start with a \`*\`.
`;

async function getOpenAISummaryForFile(
  prompt: string,
): Promise<string> {
  try {
    const openAIPrompt = `${OPEN_AI_PROMPT}\`\`\`\n\nSUMMARY:\n`;
    console.log(`OpenAI file summary prompt:\n${openAIPrompt}`);

    if (openAIPrompt.length > MAX_OPEN_AI_QUERY_LENGTH) {
      throw new Error("OpenAI query too big");
    }

    const response = await openai.createCompletion({
      model: MODEL_NAME,
      prompt: openAIPrompt,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    });
    if (
      response.data.choices !== undefined &&
      response.data.choices.length > 0
    ) {
      return (
        response.data.choices[0].text ?? "Error: couldn't generate summary"
      );
    }
  } catch (error) {
    console.error(error);
  }
  return "Error: couldn't generate summary";
}

async function createReviewComment(repository: PayloadRepository, pullNumber: number, comment: string) {
  const pullRequest = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber,
  });
  await octokit.issues.createComment({
    owner: repository.owner.login,
    repo: repository.name,
    issue_number: pullNumber,
    body: comment,
    commit_id: pullRequest.data.head.sha,
  });
}



export async function postPRSummary(
  pullNumber: number,
  repository: PayloadRepository
) {

  // const rawDiff = await octokit.request({ method: "GET", url: `https://github.com/Shopify/${repository.name}/pull/${pullNumber}.diff`, headers: { Accept: "application/vnd.github.v3.diff" } })
  // const rawDiff = await octokit.request({ method: "GET", url: `https://github.com/Shopify/${repository.name}/pull/${pullNumber}.diff`, owner: repository.owner, repo: repository.name, headers: { Accept: 'application/vnd.github.diff', }, })
  const filesChanged = await octokit.pulls.listFiles({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber,
  });
  let patch: string | undefined;
  patch = "";
  //iterate over listofFiles and get cumulative patch from each file
  for (const file of filesChanged.data) {
    console.log(`file: ${JSON.stringify(file)}`)
    patch.concat("\n", JSON.stringify(file.patch));
  }
  console.log(
    `Raw diff received from GH: ${patch}`
  )
  const prSummary = await getOpenAISummaryForFile(JSON.stringify(patch));
  console.log(
    `prSummary ${prSummary}`
  );
  await createReviewComment(repository, pullNumber, prSummary)


}


