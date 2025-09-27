// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PrivacyLottery {
    // Enum representing different states of a lottery
    enum LotteryState { Open, Closed, WinnerDrawn, Completed }
    
    // Structure to store lottery details
    struct Lottery {
        address creator;          // Address of lottery creator
        string prizeDescription;   // Text description of the prize
        uint256 deadline;          // Timestamp when lottery closes
        LotteryState state;        // Current state of the lottery
        address[] participants;   // List of participant addresses
        address winner;            // Address of the winner
    }
    
    // Mapping of lottery IDs to Lottery structs
    mapping(uint256 => Lottery) public lotteries;
    
    // Counter for generating unique lottery IDs
    uint256 public lotteryCounter;
    
    // Events for important contract actions
    event LotteryCreated(uint256 indexed lotteryId, address creator, string prizeDescription, uint256 deadline);
    event ParticipantEntered(uint256 indexed lotteryId, address participant);
    event WinnerDrawn(uint256 indexed lotteryId, address winner);
    
    // Modifier to check if lottery exists
    modifier lotteryExists(uint256 lotteryId) {
        require(lotteryId < lotteryCounter, "Lottery does not exist");
        _;
    }
    
    /**
     * @notice Creates a new lottery
     * @param _prizeDescription Text description of the prize
     * @param _deadline Timestamp when lottery entries close
     */
    function createLottery(string calldata _prizeDescription, uint256 _deadline) external {
        require(bytes(_prizeDescription).length > 0, "Prize description required");
        require(_deadline > block.timestamp, "Deadline must be in the future");
        
        uint256 lotteryId = lotteryCounter++;
        lotteries[lotteryId] = Lottery({
            creator: msg.sender,
            prizeDescription: _prizeDescription,
            deadline: _deadline,
            state: LotteryState.Open,
            participants: new address[](0),
            winner: address(0)
        });
        
        emit LotteryCreated(lotteryId, msg.sender, _prizeDescription, _deadline);
    }
    
    /**
     * @notice Allows participants to enter a lottery
     * @param lotteryId ID of the lottery to enter
     */
    function enterLottery(uint256 lotteryId) external lotteryExists(lotteryId) {
        Lottery storage lottery = lotteries[lotteryId];
        require(lottery.state == LotteryState.Open, "Lottery not open");
        require(block.timestamp < lottery.deadline, "Lottery deadline passed");
        
        // Check if participant already entered
        for (uint i = 0; i < lottery.participants.length; i++) {
            if (lottery.participants[i] == msg.sender) {
                revert("Participant already entered");
            }
        }
        
        lottery.participants.push(msg.sender);
        emit ParticipantEntered(lotteryId, msg.sender);
    }
    
    /**
     * @notice Draws a winner for the lottery (only callable by creator)
     * @param lotteryId ID of the lottery to draw winner for
     */
    function drawWinner(uint256 lotteryId) external lotteryExists(lotteryId) {
        Lottery storage lottery = lotteries[lotteryId];
        require(msg.sender == lottery.creator, "Only creator can draw");
        require(lottery.state == LotteryState.Open, "Lottery not open");
        require(lottery.participants.length > 0, "No participants");
        
        // Generate random index using on-chain data
        uint256 randomIndex = _generateRandomIndex(lotteryId, lottery.participants.length);
        
        // Set winner and update state
        lottery.winner = lottery.participants[randomIndex];
        lottery.state = LotteryState.Completed;
        
        emit WinnerDrawn(lotteryId, lottery.winner);
    }
    
    /**
     * @notice Generates a pseudo-random index using on-chain data
     * @param lotteryId ID of the lottery for additional entropy
     * @param participantsCount Number of participants in the lottery
     * @return Random index between 0 and participantsCount-1
     */
    function _generateRandomIndex(uint256 lotteryId, uint256 participantsCount) private view returns (uint256) {
        // Combine various on-chain data points for entropy
        bytes32 hash = keccak256(abi.encodePacked(
            blockhash(block.number - 1), // Previous block hash
            block.timestamp,              // Current block timestamp
            lotteryId,                    // Unique lottery ID
            participantsCount,            // Number of participants
            msg.sender                    // Drawer address
        ));
        
        return uint256(hash) % participantsCount;
    }
    
    /**
     * @notice Gets the number of participants in a lottery
     * @param lotteryId ID of the lottery
     * @return Number of participants
     */
    function getParticipantsCount(uint256 lotteryId) external view lotteryExists(lotteryId) returns (uint256) {
        return lotteries[lotteryId].participants.length;
    }
    
    /**
     * @notice Gets the current state of a lottery
     * @param lotteryId ID of the lottery
     * @return Current state of the lottery
     */
    function getLotteryState(uint256 lotteryId) external view lotteryExists(lotteryId) returns (LotteryState) {
        return lotteries[lotteryId].state;
    }
    
    /**
     * @notice Gets the prize description for a lottery
     * @param lotteryId ID of the lottery
     * @return Prize description text
     */
    function getPrizeDescription(uint256 lotteryId) external view lotteryExists(lotteryId) returns (string memory) {
        return lotteries[lotteryId].prizeDescription;
    }
    
    /**
     * @notice Gets the list of participants for a lottery
     * @param lotteryId ID of the lottery
     * @return List of participant addresses
     */
    function getParticipants(uint256 lotteryId) external view lotteryExists(lotteryId) returns (address[] memory) {
        return lotteries[lotteryId].participants;
    }
}