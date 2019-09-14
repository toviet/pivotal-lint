const core = require("@actions/core");
const github = require("@actions/github");
const axios = require("axios");

/**
 *  Extract pivotal id from the branch name
 * @param {string} branch
 */
const getPivotalId = branch => {
  const match = branch.match(/\d{9}/);
  if (match && match.length) {
    return match[0];
  }
  return "";
};

async function run() {
  try {
    const PIVOTAL_TOKEN = core.getInput("pivotal-token", { required: true });
    const GITHUB_TOKEN = core.getInput("github-token", { required: true });

    // it is easier to get from the workflow context
    const headBranch = core.getInput("head-branch", { required: true });
    const client = new github.GitHub(GITHUB_TOKEN);

    const {
      payload: { repository, organization, pull_request },
    } = github.context;

    const repoDetails = {
      owner: organization.login,
      repo: repository.name
    };

    const request = axios.create({
      baseURL: `https://www.pivotaltracker.com/services/v5`,
      timeout: 2000,
      headers: { "X-TrackerToken": PIVOTAL_TOKEN }
    });

    /**
     * Get story details based on story id
     */
    const getStoryDetails = async storyId => {
      return await request.get(`/stories/${storyId}`).then(res => res.data);
    };

    /**
     * Get project details based on project id
     * @param {string} projectId
     */
    const getProjectDetails = async projectId => {
      return await request.get(`/projects/${projectId}`).then(res => res.data);
    };

    /**
     * Add the specified label to the PR
     * @param {object} client
     * @param {string} prNumber
     * @param {string[]} label
     */
    const addLabels = async (client, prNumber, label) => {
      try {
        await client.issues.addLabels({
          ...repoDetails,
          issue_number: prNumber,
          labels: [label]
        });
      } catch (error) {
        core.setFailed(error.message);
      }
    };

    /**
     * Check the pivotal story using the pivotal API
     */
    const checkPivotal = async () => {
      console.log("Checking pivotal id for ", headBranch);
      const pivotalId = getPivotalId(headBranch);
      console.log("pivotalId -> ", pivotalId);

      if (!pivotalId) {
        core.setFailed("Pivotal id is missing in your branch.");
        return false;
      }

      const storyDetails = await getStoryDetails(pivotalId);
      const { project_id, id } = storyDetails;
      if (id && project_id) {
        const project = await getProjectDetails(project_id);
        const { name } = project;
        return name || false;
      } else {
        core.setFailed(
          "Invalid pivotal story id. Please create a branch with a valid pivotal story"
        );
        return false;
      }
    };

    const projectName = await checkPivotal();
    console.log("projectName -> ", projectName);
    if (!projectName) {
      core.setFailed("Could not get project name from the pivotal id");
      return;
    }
    const prNumber = pull_request.number;
    if (!prNumber) {
      core.setFailed("Could not get pull request number from context, exiting");
    }
    // Jarvis POD -> jarvis
    const label = projectName.split(" ")[0].toLowerCase();
    addLabels(client, prNumber, label);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();